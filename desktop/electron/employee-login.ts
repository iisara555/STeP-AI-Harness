import { existsSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { googleAuthorization, type GoogleIdentity } from './google-oauth';
import type { EmployeeLoginState } from '../src/employee-login-types';

export const EMPLOYEE_DOMAIN = 'step.cmu.ac.th';
export const EMPLOYEE_SCOPES = ['openid', 'email', 'profile'];
export type EmployeeLoginConfig = {
  required: boolean;
  clientId: string;
  sessionHours: number;
  sharedDevice?: boolean;
  policyInvalid?: boolean;
};
/** Existing isolated development smokes bypass login; packaged apps never accept that environment override. */
export const employeeLoginConfig = (
  config: EmployeeLoginConfig,
  packaged: boolean,
  environment: NodeJS.ProcessEnv,
  sharedDevice = false,
  policyInvalid = false,
) => ({
  ...config,
  sharedDevice,
  policyInvalid,
  required: config.required && (packaged || !environment.STEP_DESKTOP_TEST_HOME || environment.STEP_DESKTOP_TEST_LOGIN === '1'),
});
type Protection = { wrap: (value: string) => Buffer; unwrap: (value: Buffer) => string };
type Session = { identity: GoogleIdentity; clientId: string; issuedAt: number; expiresAt: number };
type Record = { version: 1; owner: { subject: string; label: string }; session?: Session };
type Authorize = (config: EmployeeLoginConfig, signal: AbortSignal) => Promise<GoogleIdentity>;

/** Identity-only consent never enrolls Vault or retains Google access/refresh tokens. */
export const authorizeEmployee =
  (open: (url: string) => Promise<void>, transport: typeof fetch = (url, init) => fetch(url, init)): Authorize =>
  async (config, signal) => {
    const result = await googleAuthorization(
      { clientId: config.clientId, domains: [EMPLOYEE_DOMAIN] },
      EMPLOYEE_SCOPES,
      open,
      signal,
      transport,
      undefined,
      false,
    );
    if (signal.aborted) throw new Error('CANCELLED');
    return result.who;
  };

const validIdentity = (who: GoogleIdentity) =>
  who &&
  /^\d{1,100}$/.test(who.sub) &&
  who.hd === EMPLOYEE_DOMAIN &&
  typeof who.email === 'string' &&
  who.email.length <= 254 &&
  /^[^\s@]+@[^\s@]+$/.test(who.email);

/** One verified Google subject owns an OS profile; signing out preserves that binding and all work. */
export class EmployeeLogin {
  private record?: Record;
  private damaged = false;
  private controller?: AbortController;
  private pending?: { identity: GoogleIdentity; config: EmployeeLoginConfig };
  private epoch = 0;
  private error?: string;
  readonly path: string;

  constructor(
    private directory: string,
    private config: () => EmployeeLoginConfig,
    private protection: Protection,
    private authorize: Authorize,
    private now: () => number = () => Date.now(),
  ) {
    this.path = join(directory, 'employee-session.bin');
    try {
      this.checkPath();
      if (!existsSync(this.path)) return;
      const value = JSON.parse(protection.unwrap(readFileSync(this.path))) as Record;
      if (
        value.version !== 1 ||
        !value.owner ||
        !/^\d{1,100}$/.test(value.owner.subject) ||
        typeof value.owner.label !== 'string' ||
        value.owner.label.length > 280 ||
        (value.session &&
          (!validIdentity(value.session.identity) ||
            value.session.identity.sub !== value.owner.subject ||
            typeof value.session.clientId !== 'string' ||
            !Number.isFinite(value.session.issuedAt) ||
            !Number.isFinite(value.session.expiresAt) ||
            value.session.expiresAt <= value.session.issuedAt ||
            value.session.expiresAt > value.session.issuedAt + 24 * 3600000))
      )
        throw new Error('AUTH_SESSION_INVALID');
      this.record = value;
    } catch {
      // Never overwrite an unreadable owner binding and expose a legacy workspace to a different identity.
      this.damaged = true;
      this.error = 'AUTH_SESSION_INVALID';
    }
  }

  private checkPath() {
    const dir = lstatSync(this.directory);
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('AUTH_STORAGE_UNAVAILABLE');
    try {
      const file = lstatSync(this.path);
      if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size > 32000) throw new Error('AUTH_SESSION_INVALID');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private save(record: Record) {
    this.checkPath();
    const temporary = join(this.directory, '.employee-session-' + randomUUID());
    try {
      writeFileSync(temporary, this.protection.wrap(JSON.stringify(record)), { flag: 'wx', mode: 0o600 });
      renameSync(temporary, this.path);
      this.record = record;
    } catch {
      throw new Error('AUTH_STORAGE_UNAVAILABLE');
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  private session() {
    const config = this.config(),
      session = this.record?.session,
      now = this.now();
    if (
      config.sharedDevice ||
      config.policyInvalid ||
      this.damaged ||
      !session ||
      session.clientId !== config.clientId ||
      now < session.issuedAt - 60000 ||
      now >= Math.min(session.expiresAt, session.issuedAt + config.sessionHours * 3600000)
    )
      return undefined;
    return session;
  }

  state(): EmployeeLoginState {
    const config = this.config(),
      session = this.session();
    return {
      required: config.required,
      domain: EMPLOYEE_DOMAIN,
      phase: !config.required
        ? 'disabled'
        : this.damaged || config.sharedDevice || config.policyInvalid
          ? 'locked'
          : this.controller
            ? 'browser'
            : this.pending
              ? 'adopt'
              : session
                ? 'authenticated'
                : 'signed-out',
      ...(this.record && !config.sharedDevice && !config.policyInvalid ? { ownerLabel: this.record.owner.label } : {}),
      ...(session
        ? {
            email: session.identity.email,
            name: session.identity.name,
            expiresAt: Math.min(session.expiresAt, session.issuedAt + config.sessionHours * 3600000),
          }
        : {}),
      ...(this.pending ? { email: this.pending.identity.email, name: this.pending.identity.name } : {}),
      ...(config.policyInvalid
        ? { error: 'AUTH_POLICY_INVALID' }
        : config.sharedDevice
          ? { error: 'AUTH_SHARED_DEVICE' }
          : this.error
            ? { error: this.error }
            : {}),
    };
  }

  assert() {
    if (this.config().required && !this.session()) throw new Error('AUTH_REQUIRED');
  }

  subject() {
    this.assert();
    return this.config().required ? this.session()?.identity.sub : undefined;
  }

  async login() {
    if (this.config().policyInvalid) throw new Error('AUTH_POLICY_INVALID');
    if (this.config().sharedDevice) throw new Error('AUTH_SHARED_DEVICE');
    if (this.damaged) throw new Error('AUTH_SESSION_INVALID');
    if (this.controller || this.pending) throw new Error('AUTH_BUSY');
    const config = { ...this.config() };
    if (!config.required) throw new Error('AUTH_DISABLED');
    const controller = new AbortController(),
      epoch = ++this.epoch;
    this.controller = controller;
    this.error = undefined;
    try {
      const identity = await this.authorize(config, controller.signal);
      if (epoch !== this.epoch || controller.signal.aborted) throw new Error('CANCELLED');
      if (
        config.clientId !== this.config().clientId ||
        !this.config().required ||
        this.config().sharedDevice ||
        this.config().policyInvalid
      )
        throw new Error('POLICY_CHANGED');
      if (!validIdentity(identity)) throw new Error('GOOGLE_ORGANIZATION_DENIED');
      if (this.record && identity.sub !== this.record.owner.subject) throw new Error('AUTH_OWNER_MISMATCH');
      if (!this.record && existsSync(join(this.directory, 'workspace.sqlite'))) {
        this.pending = { identity, config };
      } else this.accept(identity, this.config());
    } catch (error) {
      if (epoch === this.epoch) {
        const code = (error as Error).message;
        this.error = /^(AUTH_|GOOGLE_|CANCELLED$|POLICY_CHANGED$)/.test(code) ? code : 'GOOGLE_REQUEST_FAILED';
      }
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
    return this.state();
  }

  private accept(identity: GoogleIdentity, config: EmployeeLoginConfig) {
    const issuedAt = this.now();
    this.save({
      version: 1,
      owner: this.record?.owner || { subject: identity.sub, label: identity.email.slice(0, 2) + '••••@' + EMPLOYEE_DOMAIN },
      session: { identity, clientId: config.clientId, issuedAt, expiresAt: issuedAt + config.sessionHours * 3600000 },
    });
    this.pending = undefined;
    this.error = undefined;
  }

  adopt() {
    if (!this.pending) throw new Error('AUTH_REQUIRED');
    const { identity, config } = this.pending;
    if (
      config.clientId !== this.config().clientId ||
      !this.config().required ||
      this.config().sharedDevice ||
      this.config().policyInvalid
    ) {
      this.cancel();
      throw new Error('POLICY_CHANGED');
    }
    this.accept(identity, this.config());
    return this.state();
  }

  cancel() {
    this.epoch++;
    this.controller?.abort();
    this.controller = undefined;
    this.pending = undefined;
    this.error = undefined;
    return this.state();
  }

  logout() {
    if (this.record) this.save({ version: 1, owner: this.record.owner });
    return this.cancel();
  }
}

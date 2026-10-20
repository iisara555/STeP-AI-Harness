import { randomUUID } from 'node:crypto';
import { Vault, type VaultPayload } from './vault';
import { VaultManagers, type ManagerItem } from './vault-managers';
import { VaultRedaction } from './vault-redaction';
import { totp } from './vault-otp';

type Entry = { handle: string; label: string; origin: string; kind: string; identifier?: string; twoFactor: boolean; source: string };
type Grant = { context: string; epoch: number; expires: number; entry: Entry; id?: string; revision?: number; external?: ManagerItem };
/** Session-bound handles work across password and second-factor steps, without exposing stable storage IDs. */
export class VaultBroker {
  private handles = new Map<string, Grant>();
  constructor(
    readonly vault: Vault,
    readonly managers: VaultManagers,
    readonly redaction: VaultRedaction,
  ) {}
  async list(context: string, origin: string) {
    if (this.vault.state().suspended) throw new Error('VAULT_SUSPENDED');
    for (const [id, grant] of this.handles)
      if (grant.expires < Date.now() || grant.epoch !== this.vault.generation()) this.handles.delete(id);
    const entries: Entry[] = [];
    const add = (entry: Omit<Entry, 'handle'>, id?: string, revision?: number, external?: ManagerItem) => {
      const existing = [...this.handles.values()].find(
        grant =>
          grant.context === context &&
          grant.entry.origin === entry.origin &&
          (id ? grant.id === id : grant.external?.source === external?.source && grant.external?.id === external?.id),
      );
      if (existing) {
        existing.expires = Date.now() + 1800000;
        existing.external = external;
        entries.push({ ...entry, handle: existing.entry.handle });
        return;
      }
      if (this.handles.size >= 1000) throw new Error('VAULT_LIMIT');
      const handle = randomUUID();
      const value = { ...entry, handle };
      this.handles.set(handle, {
        context,
        epoch: this.vault.generation(),
        expires: Date.now() + 1800000,
        entry: value,
        id,
        revision,
        external,
      });
      entries.push(value);
    };
    for (const item of this.vault.browserItems(origin)) {
      add(
        {
          label: item.label,
          origin: item.origin,
          kind: item.kind,
          identifier: item.identifier,
          twoFactor: item.twoFactor,
          source: 'local',
        },
        item.id,
        item.revision,
      );
    }
    const { items, locked } = await this.managers.list();
    for (const item of items)
      if (item.origins.includes(origin))
        add(
          { label: item.label, origin, kind: 'website', identifier: item.identifier, twoFactor: item.twoFactor, source: item.source },
          undefined,
          undefined,
          item,
        );
    return { entries, locked, sources: this.managers.state() };
  }
  async use<T>(
    handle: string,
    context: string,
    origin: string,
    otp: boolean,
    approve: (entry: Entry) => Promise<boolean>,
    sink: (payload: VaultPayload & { code?: string }, entry: Entry) => Promise<T>,
  ) {
    const grant = this.handles.get(handle);
    const valid = () => {
      if (
        !grant ||
        grant.context !== context ||
        grant.entry.origin !== origin ||
        grant.expires < Date.now() ||
        grant.epoch !== this.vault.generation() ||
        this.vault.state().suspended
      )
        throw new Error('VAULT_ACCESS_DENIED');
      if (otp && grant.entry.kind !== 'website') throw new Error('VAULT_ACCESS_DENIED');
    };
    valid();
    const run = async (payload: VaultPayload & { code?: string }) => {
      valid();
      if (otp && payload.otpSecret) payload.code = totp(payload.otpSecret);
      this.redaction.register(payload.password, payload.code);
      grant!.expires = Date.now() + 1800000;
      return sink(payload, grant!.entry);
    };
    if (grant!.external) {
      if (!(await approve(grant!.entry))) throw new Error('CANCELLED');
      valid();
      const payload = await this.managers.resolve(grant!.external, otp);
      return run(payload);
    }
    if (this.vault.list().find(item => item.id === grant!.id)?.revision !== grant!.revision) throw new Error('VAULT_REVISION_CHANGED');
    const inner = this.vault.browserHandle(grant!.id!, context, origin);
    return this.vault.fill(
      inner,
      context,
      origin,
      () => approve(grant!.entry),
      payload => run(payload),
    ) as Promise<T>;
  }
  invalidate() {
    this.handles.clear();
  }
  localHandle(id: string, context: string) {
    return [...this.handles.values()].find(grant => grant.id === id && grant.context === context)?.entry.handle;
  }
}

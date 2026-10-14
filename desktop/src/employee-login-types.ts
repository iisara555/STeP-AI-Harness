export type EmployeeLoginState = {
  required: boolean;
  phase: 'disabled' | 'signed-out' | 'browser' | 'adopt' | 'authenticated' | 'locked';
  domain: string;
  email?: string;
  name?: string;
  ownerLabel?: string;
  expiresAt?: number;
  error?: string;
};

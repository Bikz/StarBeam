export type ConnectState = {
  ok: boolean;
  message?: string;
  fieldErrors?: {
    token?: string;
    repos?: string;
  };
};

export const initialConnectState: ConnectState = { ok: true };

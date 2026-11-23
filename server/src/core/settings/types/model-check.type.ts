export type ModelCheck =
  | { readonly isAccepted: true; readonly modelName: string }
  | { readonly isAccepted: false; readonly error: string };

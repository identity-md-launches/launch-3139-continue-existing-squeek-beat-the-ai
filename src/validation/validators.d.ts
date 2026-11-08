type Validate = ((data: unknown) => boolean) & { errors?: unknown[] | null };
export const status: Validate;
export const history: Validate;
export const events: Validate;

export type ResponseBase<T> =
  | {
      ok: true
      data: T
      error?: never
    }
  | {
      ok: false
      data?: never
      error: string
    }

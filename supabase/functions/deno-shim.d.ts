// Deklarasi minimal Deno agar Edge Functions bisa di-typecheck dengan tsc (tsconfig.functions.json).
declare namespace Deno {
  const env: { get(key: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): void
}

/** Kode tiket SPU-YYMM-NNNN-XXXX; XXXX dari alfabet tanpa karakter ambigu (0/O/1/I/L/U). */
export const TICKET_RE = /^SPU-[0-9]{4}-[0-9]{4}-[2-9A-HJKMNP-TV-Z]{4}$/

/** Rapikan input pengguna: huruf besar, spasi/strip dirapikan. null bila formatnya salah. */
export function normalizeTicketCode(input: string): string | null {
  const compact = (input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  // SPU + 4 + 4 + 4 = 15 karakter
  if (!/^SPU[0-9]{8}[0-9A-Z]{4}$/.test(compact)) return null
  const code = `SPU-${compact.slice(3, 7)}-${compact.slice(7, 11)}-${compact.slice(11)}`
  return TICKET_RE.test(code) ? code : null
}

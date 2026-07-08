// Metadata lives in the layout so the page itself can be a client component (it drives the
// count-up + scroll reveals). Same title/description as before.
export const metadata = {
  title: 'Huddle — Split offline, settle in USD₮',
  description:
    'A peer-to-peer group expense splitter. Track who owes whom with zero signal, then settle debts wallet-to-wallet in USD₮ — no servers, no custody.'
}

export default function AboutLayout ({ children }) {
  return children
}

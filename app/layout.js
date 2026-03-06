export const metadata = {
  title: 'Situation — Polymarket Intelligence',
  description: 'Track the best Polymarket traders in real time',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#050810' }}>
        {children}
      </body>
    </html>
  )
}

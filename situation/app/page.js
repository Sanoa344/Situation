import dynamic from 'next/dynamic'

const Situation = dynamic(() => import('../components/Situation'), { ssr: false })

export default function Home() {
  return <Situation />
}

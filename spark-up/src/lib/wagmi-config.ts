// src/lib/wagmi-config.ts
import { createConfig, http } from 'wagmi'
import { scrollSepolia } from 'wagmi/chains'
import { walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [scrollSepolia],
  connectors: [
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
      showQrModal: true
    }),
  ],
  transports: {
    [scrollSepolia.id]: http(),
  },
  ssr: true
})
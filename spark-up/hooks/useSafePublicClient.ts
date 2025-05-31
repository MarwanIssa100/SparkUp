import { usePublicClient } from 'wagmi'
import { scrollSepolia } from 'wagmi/chains'

export function useSafePublicClient() {
  const publicClient = usePublicClient({ chainId : scrollSepolia.id })
  if (!publicClient) {
    throw new Error('publicClient not available')
  }
  return publicClient
}
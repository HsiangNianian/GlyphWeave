import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas'],
  transpilePackages: ['konva', 'react-konva'],
}

export default nextConfig

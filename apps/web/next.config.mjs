/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // packages/shared uses NodeNext moduleResolution which requires .js extensions in imports.
    // Webpack doesn't resolve .js -> .ts automatically, so we teach it to.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig

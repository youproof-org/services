import type { NextConfig } from 'next'

function patchCssModules(rules: any[]): number {
  let patched = 0
  for (const rule of rules) {
    if (!rule) continue
    if (rule.oneOf) patched += patchCssModules(rule.oneOf)
    const uses = rule.use
      ? Array.isArray(rule.use) ? rule.use : [rule.use]
      : []
    for (const u of uses) {
      if (!u || typeof u !== 'object') continue
      const loaderPath: string = u.loader ?? ''
      if (loaderPath.includes('css-loader') && u.options?.modules) {
        const original = u.options.modules.getLocalIdent
        u.options.modules.getLocalIdent = (
          context: { resourcePath: string },
          localIdentName: string,
          localName: string,
          options: unknown,
          meta?: unknown,
        ) => {
          const rp: string = context.resourcePath ?? ''
          // Only rename our own module files, not Next.js internals or fonts
          if (/\.module\.(scss|css|sass|less)$/.test(rp) && !rp.includes('node_modules')) {
            const fileName = rp.replace(/\\/g, '/').split('/').pop() ?? ''
            const base = fileName.replace(/\.module\.(scss|css|sass|less)$/, '')
            return `${base}_${localName}`
          }
          return original(context, localIdentName, localName, options, meta)
        }
        patched++
      }
    }
  }
  return patched
}

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['js-yaml', 'chokidar'],
  sassOptions: {
    includePaths: ['./styles'],
  },
  webpack(config) {
    patchCssModules(config.module.rules as any[])
    return config
  },
}

export default nextConfig

import type { MetadataRoute } from 'next'

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/pricing', '/privacy', '/terms', '/contact']

  return routes.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.8,
  }))
}

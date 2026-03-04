import type { MetadataRoute } from 'next'
import { resolveSiteUrl } from "@/lib/site-url"

const appUrl = resolveSiteUrl()

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/pricing', '/pilot-testing', '/privacy', '/terms', '/contact']

  return routes.map((route) => ({
    url: `${appUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.8,
  }))
}

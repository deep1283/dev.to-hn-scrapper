import type { MetadataRoute } from 'next'
import { resolveSiteUrl } from "@/lib/site-url"

const appUrl = resolveSiteUrl()

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          "/api/",
          "/dashboard",
          "/settings",
          "/onboarding",
          "/upgrade",
          "/login",
          "/sign-in",
          "/sign-up",
          "/auth/",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  }
}

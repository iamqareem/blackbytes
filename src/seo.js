export function generateJsonLd(post, siteUrl) {
    const postUrl = `${siteUrl}/post/${post.id}`;
    const imageUrl = post.media_url || `${siteUrl}/icons/og-image.png`;

    // Video posts (YouTube/TikTok embeds) — VideoObject gives Google rich
    // video results and tells LLMs exactly what this page is.
    const isVideo = ['embed', 'shorts', 'video'].includes(post.media_type) &&
        (post.source_url.includes('youtube.com') || post.source_url.includes('youtu.be') ||
         post.source_url.includes('tiktok.com'));
    if (isVideo) {
        const ytId = post.source_url.match(/(?:shorts\/|v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        return {
            '@context': 'https://schema.org',
            '@type': 'VideoObject',
            name: post.title,
            description: post.summary,
            thumbnailUrl: [imageUrl],
            uploadDate: post.created_at,
            embedUrl: ytId ? `https://www.youtube.com/embed/${ytId}` : post.source_url,
            contentUrl: post.source_url,
            url: postUrl,
            publisher: {
                '@type': 'Organization',
                name: 'Snapfeed',
                logo: { '@type': 'ImageObject', url: `${siteUrl}/icons/icon-512.png` },
            },
        };
    }

    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.summary,
        image: imageUrl,
        url: postUrl,
        datePublished: post.created_at,
        dateModified: post.indexed_at || post.created_at,
        author: {
            '@type': 'Person',
            name: post.source_name,
            url: post.source_url,
        },
        publisher: {
            '@type': 'Organization',
            name: 'Snapfeed',
            logo: {
                '@type': 'ImageObject',
                url: `${siteUrl}/icons/icon-512.png`,
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': postUrl,
        },
    };
}

export function generateItemListJsonLd(posts, siteUrl) {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: posts.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
                '@type': 'BlogPosting',
                headline: post.title,
                description: post.summary,
                url: `${siteUrl}/post/${post.id}`,
                datePublished: post.created_at,
            },
        })),
    };
}

export function injectJsonLd(html, jsonLd) {
    const script = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    return html.replace('</head>', `${script}\n</head>`);
}
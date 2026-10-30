export function generateJsonLd(post, siteUrl) {
    const postUrl = `${siteUrl}/?post=${post.id}`;
    const imageUrl = post.media_url || `${siteUrl}/icons/og-image.png`;
    
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
                url: `${siteUrl}/?post=${post.id}`,
                datePublished: post.created_at,
            },
        })),
    };
}

export function injectJsonLd(html, jsonLd) {
    const script = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    return html.replace('</head>', `${script}\n</head>`);
}
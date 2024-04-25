import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
    title: 'Ddd toolkit',
    description: 'Simple ddd stuffs',
    base: '/ddd-toolkit/',
    head: [['link', { rel: 'icon', href: 'favicon.ico' }]],
    themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        logo: '/logo.jpeg',
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Examples', link: '/examples' },
        ],

        sidebar: [
            {
                text: 'Getting Started',
                link: '/getting-started',
            },
            {
                text: 'Components',
                items: [
                    { text: 'Aggregate repo', link: '/aggregate-repo' },
                ],
            },
        ],

        socialLinks: [
            { icon: 'github', link: 'https://github.com/fizzbuds/ddd-toolkit' },
        ],

        footer: {
            copyright: 'Copyright © <a href="https://www.linkedin.com/in/toselli-gabriele/" target="_blank">Gabriele Toselli</a>, <a href="https://www.linkedin.com/in/lucagiovenzana/" target="_blank">Luca Giovenzana</a> and contributors.',
        },

        lastUpdated: {
            text: 'Updated at',
            formatOptions: {
                dateStyle: 'short',
            },
        },

        editLink: {
            pattern: 'https://github.com/fizzbuds/ddd-toolkit/edit/main/docs/:path',
            text: 'Edit this page on GitHub',
        },
    },
});

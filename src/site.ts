import { type CollectionEntry, getCollection } from 'astro:content';

export const SITE = {
	title: 'notDeadCaller',
	tagline: 'security research and software',
	description: 'Security research, writeups and projects by Avishek (notDeadCaller), Kolkata.',
	author: 'Avishek',
	quote: 'you are now less valuable than the data you produce',
};

export const NAV = [
	{ href: '/writeups/', label: 'Writeups' },
	{ href: '/notes/', label: 'Notes' },
	{ href: '/projects/', label: 'Projects' },
	{ href: '/resume/', label: 'Resume' },
	{ href: '/about/', label: 'About' },
];

export const SOCIALS = [
	{ href: 'https://github.com/notDeadCaller', label: 'GitHub' },
	{ href: '/rss.xml', label: 'RSS' },
];

export const SECTIONS = {
	writeups: { title: 'Writeups', label: 'Writeup', blurb: 'Penetration testing findings, CTF solutions and vulnerability research.' },
	notes: { title: 'Notes', label: 'Note', blurb: 'Shorter pieces on tools, ideas and things I am learning.' },
};

export type Section = keyof typeof SECTIONS;
export type Post = CollectionEntry<Section>;

export async function getPosts(section: Section): Promise<Post[]> {
	const posts = await getCollection(section, ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getFeed(): Promise<Post[]> {
	const posts = [...(await getPosts('writeups')), ...(await getPosts('notes'))];
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export const postUrl = (post: Post) => `/${post.collection}/${post.id}/`;
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const readingMinutes = (body = '') => Math.max(1, Math.round(body.split(/\s+/).length / 220));

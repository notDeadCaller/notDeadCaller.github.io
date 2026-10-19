import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { resume } from '../../data/resume';
import { type OgCard, ogImage } from '../../lib/og';
import { getPosts, SECTIONS, type Section, SITE } from '../../site';

// one preview image per shareable page, at /og/<route>.png (Base.astro points og:image here)
export async function getStaticPaths() {
	const cards: (OgCard & { route: string })[] = [
		{ route: 'index', kicker: 'Security research and software', title: SITE.title, description: SITE.description, seed: 'home' },
		{ route: 'projects', kicker: 'Projects', title: 'Projects', description: 'Software I have built, from mobile apps to network tools.', seed: 'projects' },
		{ route: 'resume', kicker: 'Resume', title: resume.name, description: resume.summary, seed: 'resume' },
		{ route: 'about', kicker: 'About', title: 'About', description: 'Avishek, also known as notDeadCaller. Based in Kolkata.', seed: 'about' },
	];
	for (const section of Object.keys(SECTIONS) as Section[]) {
		const { title, label, blurb } = SECTIONS[section];
		cards.push({ route: section, kicker: title, title, description: blurb, seed: section });
		for (const post of await getPosts(section)) {
			cards.push({ route: `${section}/${post.id}`, kicker: label, title: post.data.title, description: post.data.description, seed: post.id, motif: post.data.art });
		}
	}
	for (const project of await getCollection('projects')) {
		const { title, description, art } = project.data;
		cards.push({ route: `projects/${project.id}`, kicker: 'Project', title, description, seed: project.id, motif: art });
	}
	return cards.map(({ route, ...card }) => ({ params: { route }, props: card }));
}

export const GET: APIRoute = async ({ props }) =>
	new Response(new Uint8Array(await ogImage(props as OgCard)), { headers: { 'Content-Type': 'image/png' } });

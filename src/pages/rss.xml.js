import rss from '@astrojs/rss';
import { getFeed, postUrl, SITE } from '../site';

export async function GET(context) {
	const posts = await getFeed();
	return rss({
		title: SITE.title,
		description: SITE.description,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			categories: post.data.tags,
			link: postUrl(post),
		})),
	});
}

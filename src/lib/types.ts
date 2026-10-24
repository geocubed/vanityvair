export const categories = ['Achievements', 'Announcements', 'Projects'] as const;
export type Category = (typeof categories)[number];
export type User = { email: string; name: string; role: 'owner' | 'contributor'; bio: string; slug: string; link: string; active: number; avatar?: string };
export type Story = {
  id: string; slug: string; title: string; deck: string; category: Category | '';
  body: string; hero: string; hero_alt: string; caption: string; photo_credit: string; author_email: string;
  status: 'draft' | 'review' | 'published'; revision: number; created_at: string; updated_at: string;
  published_at: string | null; published_json: string | null;
  author_name?: string; author_slug?: string; author_bio?: string; author_avatar?: string;
};
export type PromotionFormat = 'banner' | 'poster';
export type Promotion = { company_id?: string; id: string; name: string; headline: string; description: string; url: string; image: string; active: number; position: number; format: PromotionFormat; alt: string };

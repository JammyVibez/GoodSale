import { describe, expect, it } from 'vitest';
import { buildReviews, mapReview, mapReviewReply } from '@/lib/data/mappers';

const reviewRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  order_id: null,
  product_id: 42,
  reviewer_id: 7,
  reviewer_name: 'Bolanle Akinwande',
  reviewer_photo: 'https://i.pravatar.cc/300?img=31',
  reviewee_id: 3,
  rating: 5,
  comment: 'Item arrived exactly as described.',
  image_url: null,
  seller_reply: null,
  is_helpful_votes: 4,
  created_at: '2026-01-02T10:00:00.000Z',
  ...overrides,
});

const replyRow = (id: number, reviewId: number, createdAt: string, comment = 'Thank you!') => ({
  id,
  review_id: reviewId,
  author_id: 3,
  author_name: 'Yetunde Adebayo',
  author_photo: 'https://i.pravatar.cc/300?img=32',
  author_role: 'SELLER',
  comment,
  created_at: createdAt,
});

describe('mapReviewReply', () => {
  it('maps a review_replies row to the domain shape', () => {
    const reply = mapReviewReply(replyRow(9, 1, '2026-01-03T10:00:00.000Z', 'We appreciate it.'));
    expect(reply).toEqual({
      id: 9,
      authorId: 3,
      authorName: 'Yetunde Adebayo',
      authorPhoto: 'https://i.pravatar.cc/300?img=32',
      authorRole: 'SELLER',
      comment: 'We appreciate it.',
      createdAt: '2026-01-03T10:00:00.000Z',
    });
  });

  it('defaults the author role to BUYER when the column is missing', () => {
    const reply = mapReviewReply({ id: 1, review_id: 2, author_id: 4, comment: 'Nice' });
    expect(reply.authorRole).toBe('BUYER');
  });
});

describe('buildReviews', () => {
  it('attaches replies to their parent review (previously every reply was dropped)', () => {
    const reviews = buildReviews(
      [reviewRow(1), reviewRow(2, { product_id: 43, rating: 4 })],
      [
        replyRow(11, 1, '2026-01-03T09:00:00.000Z', 'First reply'),
        replyRow(12, 1, '2026-01-04T09:00:00.000Z', 'Second reply'),
        replyRow(13, 2, '2026-01-05T09:00:00.000Z', 'Only reply'),
      ]
    );

    expect(reviews).toHaveLength(2);
    expect(reviews[0].replies?.map((r) => r.comment)).toEqual(['First reply', 'Second reply']);
    expect(reviews[1].replies?.map((r) => r.comment)).toEqual(['Only reply']);
  });

  it('orders replies oldest first so the conversation reads naturally', () => {
    const reviews = buildReviews(
      [reviewRow(1)],
      [
        replyRow(2, 1, '2026-01-05T09:00:00.000Z', 'Later'),
        replyRow(1, 1, '2026-01-03T09:00:00.000Z', 'Earlier'),
        replyRow(3, 1, '2026-01-07T09:00:00.000Z', 'Latest'),
      ]
    );
    expect(reviews[0].replies?.map((r) => r.comment)).toEqual(['Earlier', 'Later', 'Latest']);
  });

  it('gives reviews without replies an empty list', () => {
    const reviews = buildReviews([reviewRow(5)], []);
    expect(reviews[0].replies).toEqual([]);
  });

  it('ignores orphan replies and keeps every review', () => {
    const reviews = buildReviews([reviewRow(1)], [replyRow(99, 1234, '2026-01-03T09:00:00.000Z')]);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].replies).toEqual([]);
  });

  it('keeps product_id so ratings appear on the product page', () => {
    const [review] = buildReviews([reviewRow(1)], []);
    expect(review.productId).toBe(42);
    expect(review.rating).toBe(5);
    expect(review.revieweeId).toBe(3);
  });
});

describe('mapReview', () => {
  it('defaults missing optional columns instead of throwing', () => {
    const review = mapReview({ id: 1, reviewer_id: 2, rating: 0, comment: 'Question about size?' });
    expect(review.productId).toBeUndefined();
    expect(review.orderId).toBeUndefined();
    expect(review.revieweeId).toBeUndefined();
    expect(review.replies).toEqual([]);
  });
});

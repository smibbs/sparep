-- Migration: 04-initial-cards.sql
-- Description: Inserts initial flashcard content
-- Dependencies: 01-initial-setup.sql, 02-user-profiles.sql, 03-subjects.sql, 04-cards.sql

-- First, create a default subject for our initial cards
INSERT INTO public.subjects (id, name, description, is_public)
VALUES (
    'c0f45d1a-e1c5-4b42-b514-a609a6e1228c', -- Fixed UUID for reproducibility
    'Web Development Basics',
    'Fundamental concepts in web development',
    true
) ON CONFLICT (id) DO NOTHING;

-- Insert our initial cards
INSERT INTO public.cards (
    id,
    question,
    answer,
    subject_id,
    is_public,
    creator_id -- This will be replaced with the admin user's ID during migration
) VALUES
(
    'b5b6d0f1-6b3a-4d9b-8d6a-2d6b6d6b6d6b',
    'What is JavaScript?',
    'JavaScript is a high-level, interpreted programming language primarily used for creating interactive web applications.',
    'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
    true,
    auth.uid()
),
(
    'c6c7d0f2-7b3a-4d9b-8d6a-3d6b6d6b6d6c',
    'What is the DOM?',
    'The Document Object Model (DOM) is a programming interface for HTML documents that represents the page as a tree-like structure of objects.',
    'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
    true,
    auth.uid()
),
(
    'd7d8d0f3-8b3a-4d9b-8d6a-4d6b6d6b6d6d',
    'What is CSS?',
    'Cascading Style Sheets (CSS) is a style sheet language used for describing the presentation of a document written in HTML.',
    'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
    true,
    auth.uid()
)
ON CONFLICT (id) DO UPDATE SET
    question = EXCLUDED.question,
    answer = EXCLUDED.answer; 
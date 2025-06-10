// Migration script for initial cards
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Note: This needs to be the service key, not the anon key

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateCards() {
    try {
        console.log('Starting card migration...');

        // First, create the subject
        const { data: subject, error: subjectError } = await supabase
            .from('subjects')
            .insert([{
                id: 'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
                name: 'Web Development Basics',
                description: 'Fundamental concepts in web development',
                is_public: true
            }])
            .select()
            .single();

        if (subjectError && !subjectError.message.includes('duplicate key')) {
            throw subjectError;
        }

        console.log('Subject created or already exists');

        // Get the admin user (first user in the system)
        const { data: users, error: userError } = await supabase
            .from('auth.users')
            .select('id')
            .limit(1);

        if (userError) throw userError;
        if (!users || users.length === 0) {
            throw new Error('No users found in the system');
        }

        const adminId = users[0].id;

        // Insert the cards
        const cards = [
            {
                id: 'b5b6d0f1-6b3a-4d9b-8d6a-2d6b6d6b6d6b',
                question: 'What is JavaScript?',
                answer: 'JavaScript is a high-level, interpreted programming language primarily used for creating interactive web applications.',
                subject_id: 'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
                is_public: true,
                creator_id: adminId
            },
            {
                id: 'c6c7d0f2-7b3a-4d9b-8d6a-3d6b6d6b6d6c',
                question: 'What is the DOM?',
                answer: 'The Document Object Model (DOM) is a programming interface for HTML documents that represents the page as a tree-like structure of objects.',
                subject_id: 'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
                is_public: true,
                creator_id: adminId
            },
            {
                id: 'd7d8d0f3-8b3a-4d9b-8d6a-4d6b6d6b6d6d',
                question: 'What is CSS?',
                answer: 'Cascading Style Sheets (CSS) is a style sheet language used for describing the presentation of a document written in HTML.',
                subject_id: 'c0f45d1a-e1c5-4b42-b514-a609a6e1228c',
                is_public: true,
                creator_id: adminId
            }
        ];

        const { data: insertedCards, error: cardError } = await supabase
            .from('cards')
            .upsert(cards)
            .select();

        if (cardError) throw cardError;

        console.log(`Successfully migrated ${insertedCards.length} cards`);
        console.log('Migration complete!');

    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
}

// Run the migration
migrateCards(); 
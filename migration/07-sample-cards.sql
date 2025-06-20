-- Sample Cards for Testing
INSERT INTO cards (question, answer, hint, explanation, is_public, difficulty_rating, tags)
VALUES
-- History (15 cards)
('Who was the first President of the United States?', 'George Washington', 'Served from 1789 to 1797', 'He was unanimously elected and established many presidential precedents', true, 2, ARRAY['history', 'politics']),
('In which year did World War II end?', '1945', 'Victory over Japan Day', 'The war ended with Japan''s surrender after the atomic bombings', true, 2, ARRAY['history', 'war']),
('Who wrote the Declaration of Independence?', 'Thomas Jefferson', 'Third US President', 'He wrote it in June 1776, and it was adopted by the Continental Congress on July 4th', true, 2, ARRAY['history', 'politics']),
('What ancient wonder was located in Alexandria, Egypt?', 'The Lighthouse of Alexandria', 'One of the Seven Wonders', 'Built between 280 and 247 BC, it was one of the tallest structures for many centuries', true, 3, ARRAY['history', 'architecture']),
('Who was the first Emperor of China?', 'Qin Shi Huang', 'Unified China in 221 BC', 'He ordered the construction of the Great Wall and the Terracotta Army', true, 3, ARRAY['history', 'asia']),
('What year did the Berlin Wall fall?', '1989', 'End of Cold War era', 'The fall of the wall symbolized the end of the Cold War division in Europe', true, 2, ARRAY['history', 'politics']),
('Who was the first woman to win a Nobel Prize?', 'Marie Curie', 'She won in Physics and Chemistry', 'She discovered radium and polonium, and pioneered research on radioactivity', true, 2, ARRAY['history', 'science']),
('What was the name of the first successful English colony in America?', 'Jamestown', 'Founded in 1607', 'Located in Virginia, it was the first permanent English settlement in North America', true, 2, ARRAY['history', 'america']),
('Which empire was ruled by Aztecs?', 'The Aztec Empire', 'Located in central Mexico', 'The empire flourished from 1428 until the Spanish conquest in 1521', true, 3, ARRAY['history', 'civilization']),
('Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Italian Renaissance artist', 'Painted in the early 16th century, it''s now in the Louvre Museum', true, 1, ARRAY['history', 'art']),
('What was the name of the first artificial satellite in space?', 'Sputnik 1', 'Launched in 1957', 'Launched by the Soviet Union, it began the space age', true, 2, ARRAY['history', 'space']),
('Which civilization built the pyramids of Giza?', 'Ancient Egyptians', 'Built around 2500 BC', 'They were built as tombs for pharaohs and their consorts', true, 1, ARRAY['history', 'architecture']),
('Who was the first European to reach India by sea?', 'Vasco da Gama', 'Portuguese explorer', 'His voyage in 1497-1499 was the first to link Europe and Asia by sea', true, 3, ARRAY['history', 'exploration']),
('What was the Renaissance?', 'A cultural movement that spanned the 14th to 17th centuries', 'Means "rebirth" in French', 'It marked the transition from medieval to modern times in Europe', true, 2, ARRAY['history', 'culture']),
('Who was Joan of Arc?', 'A French military leader and Catholic saint', 'Led French armies at age 17', 'She helped turn the tide of the Hundred Years'' War before being captured and executed', true, 2, ARRAY['history', 'religion']),

-- Science (15 cards)
('What is the speed of light?', '299,792,458 meters per second', 'Universal constant c', 'This speed is the universal speed limit and is constant in all reference frames', true, 3, ARRAY['science', 'physics']),
('What is the chemical symbol for gold?', 'Au', 'From Latin "aurum"', 'A precious metal used throughout human history', true, 1, ARRAY['science', 'chemistry']),
('What is the largest planet in our solar system?', 'Jupiter', 'Gas giant', 'It has a Great Red Spot and at least 79 moons', true, 1, ARRAY['science', 'astronomy']),
('What is the smallest unit of life?', 'Cell', 'Basic building block', 'All living things are made up of one or more cells', true, 1, ARRAY['science', 'biology']),
('What is DNA?', 'Deoxyribonucleic acid', 'Carries genetic information', 'A molecule that contains the instructions for growth, development, and reproduction', true, 2, ARRAY['science', 'biology']),
('What is Newton''s First Law?', 'An object remains at rest or in motion unless acted upon by a force', 'Law of inertia', 'This fundamental law describes the behavior of objects in motion', true, 2, ARRAY['science', 'physics']),
('What is the process by which plants make their food?', 'Photosynthesis', 'Uses sunlight', 'Converts light energy into chemical energy stored in glucose', true, 1, ARRAY['science', 'biology']),
('What is the hardest natural substance?', 'Diamond', 'Made of carbon', 'Formed under high pressure and temperature deep within the Earth', true, 1, ARRAY['science', 'geology']),
('What is the atomic number of carbon?', '6', 'Essential for life', 'This element is the basis for organic chemistry', true, 2, ARRAY['science', 'chemistry']),
('What is the theory of relativity?', 'A theory describing the relationship between space and time', 'Developed by Einstein', 'Includes both special and general relativity theories', true, 3, ARRAY['science', 'physics']),
('What are the three states of matter?', 'Solid, liquid, and gas', 'Different molecular arrangements', 'Matter can change between these states through heating or cooling', true, 1, ARRAY['science', 'physics']),
('What is the process of evolution?', 'Change in species over time through natural selection', 'Survival of the fittest', 'Theory first proposed by Charles Darwin', true, 2, ARRAY['science', 'biology']),
('What is an atom?', 'The basic unit of matter', 'Made of protons, neutrons, and electrons', 'Everything is made up of these tiny particles', true, 1, ARRAY['science', 'chemistry']),
('What is the greenhouse effect?', 'Warming of Earth''s surface due to trapped heat', 'Atmospheric phenomenon', 'Natural process enhanced by human activities', true, 2, ARRAY['science', 'environment']),
('What is the periodic table?', 'Organizational chart of chemical elements', 'Arranged by atomic number', 'Shows patterns in element properties', true, 1, ARRAY['science', 'chemistry']),

-- Geography (15 cards)
('What is the largest ocean?', 'Pacific Ocean', 'Covers about 30% of Earth''s surface', 'Located between the Americas, Asia, and Australia', true, 1, ARRAY['geography', 'oceans']),
('What is the longest river in the world?', 'Nile River', 'Located in Africa', 'Flows northward through 11 countries', true, 2, ARRAY['geography', 'rivers']),
('What is the highest mountain in the world?', 'Mount Everest', '8,848 meters high', 'Located in the Himalayas between Nepal and Tibet', true, 1, ARRAY['geography', 'mountains']),
('What is the largest country by area?', 'Russia', 'Spans two continents', 'Covers more than one-eighth of Earth''s inhabited land area', true, 1, ARRAY['geography', 'countries']),
('What is the capital of Japan?', 'Tokyo', 'Largest metropolitan area', 'Located on Honshu island', true, 1, ARRAY['geography', 'capitals']),
('What is the largest desert in the world?', 'Antarctic Desert', 'Cold desert', 'Covers an area of about 5.5 million square miles', true, 3, ARRAY['geography', 'deserts']),
('What is the smallest country in the world?', 'Vatican City', 'Located in Rome', 'Independent city-state and headquarters of the Roman Catholic Church', true, 2, ARRAY['geography', 'countries']),
('What is the Great Barrier Reef?', 'World''s largest coral reef system', 'Located off Australia', 'Visible from space and home to diverse marine life', true, 1, ARRAY['geography', 'nature']),
('What are the seven continents?', 'North America, South America, Europe, Asia, Africa, Australia, Antarctica', 'Major landmasses', 'Sometimes combined differently in various continental models', true, 1, ARRAY['geography', 'continents']),
('What is the capital of Brazil?', 'Brasília', 'Planned city', 'Became capital in 1960, replacing Rio de Janeiro', true, 2, ARRAY['geography', 'capitals']),
('What is the largest rainforest in the world?', 'Amazon Rainforest', 'Located in South America', 'Covers over 5.5 million square kilometers', true, 1, ARRAY['geography', 'nature']),
('What is the Dead Sea?', 'A salt lake bordered by Jordan and Israel', 'Lowest point on Earth', 'Has such high salt content that people can easily float', true, 2, ARRAY['geography', 'bodies of water']),
('What is the capital of Australia?', 'Canberra', 'Planned capital city', 'Chosen as a compromise between Sydney and Melbourne', true, 2, ARRAY['geography', 'capitals']),
('What are fjords?', 'Long, narrow inlets with steep sides', 'Created by glaciers', 'Common in Norway and other northern regions', true, 2, ARRAY['geography', 'landforms']),
('What is the Ring of Fire?', 'Region around the Pacific Ocean known for volcanic activity', 'Horseshoe shape', 'Contains about 75% of Earth''s volcanoes', true, 2, ARRAY['geography', 'geology']),

-- Culture & Arts (15 cards)
('Who wrote "Romeo and Juliet"?', 'William Shakespeare', 'English playwright', 'Written between 1591 and 1595', true, 1, ARRAY['culture', 'literature']),
('What is the most widely practiced religion in the world?', 'Christianity', 'Abrahamic religion', 'Based on the life and teachings of Jesus Christ', true, 1, ARRAY['culture', 'religion']),
('Who painted "The Starry Night"?', 'Vincent van Gogh', 'Dutch artist', 'Painted in 1889 while in an asylum', true, 1, ARRAY['culture', 'art']),
('What is the official language of Brazil?', 'Portuguese', 'European colonial influence', 'The largest Portuguese-speaking country in the world', true, 2, ARRAY['culture', 'language']),
('Who composed the "Ninth Symphony"?', 'Ludwig van Beethoven', 'Written while deaf', 'Includes the "Ode to Joy"', true, 2, ARRAY['culture', 'music']),
('What is the traditional Japanese art of paper folding?', 'Origami', 'From ori (folding) and kami (paper)', 'Ancient art form that creates shapes without cuts or glue', true, 1, ARRAY['culture', 'art']),
('Who wrote "One Hundred Years of Solitude"?', 'Gabriel García Márquez', 'Colombian author', 'A masterpiece of magical realism', true, 2, ARRAY['culture', 'literature']),
('What is the main ingredient in sushi?', 'Vinegared rice', 'Japanese dish', 'Raw fish is not required for sushi', true, 2, ARRAY['culture', 'food']),
('Who is known as the "Father of Modern Art"?', 'Pablo Picasso', 'Spanish artist', 'Co-founded the Cubist movement', true, 2, ARRAY['culture', 'art']),
('What is the most widely spoken language in the world?', 'Mandarin Chinese', 'Over 1 billion speakers', 'Official language of China', true, 1, ARRAY['culture', 'language']),
('What is Bollywood?', 'The Hindi-language film industry based in Mumbai', 'Indian cinema', 'Produces the most films annually in the world', true, 2, ARRAY['culture', 'entertainment']),
('Who wrote "The Divine Comedy"?', 'Dante Alighieri', 'Italian poet', 'Epic poem about journey through Hell, Purgatory, and Heaven', true, 3, ARRAY['culture', 'literature']),
('What is calligraphy?', 'The art of beautiful handwriting', 'Important in many cultures', 'Particularly significant in East Asian and Islamic art', true, 1, ARRAY['culture', 'art']),
('What is the Day of the Dead?', 'Mexican holiday celebrating deceased loved ones', 'Día de los Muertos', 'Celebrated on November 1st and 2nd', true, 2, ARRAY['culture', 'holidays']),
('Who painted the ceiling of the Sistine Chapel?', 'Michelangelo', 'Renaissance artist', 'Took four years to complete (1508-1512)', true, 1, ARRAY['culture', 'art']);

-- Countries
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('What is the capital of France?', 'Paris', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('Which country has the largest population?', 'China', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('What is the smallest country in the world?', 'Vatican City', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('Which country is known as the Land of the Rising Sun?', 'Japan', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('What is the official language of Brazil?', 'Portuguese', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('Which country is famous for the pyramids of Giza?', 'Egypt', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('What is the only country that is also a continent?', 'Australia', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('Which country has the city of Istanbul?', 'Turkey', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('What is the capital of Canada?', 'Ottawa', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true),
('Which country is home to the Taj Mahal?', 'India', 'fd9d32ef-f6f7-4156-ad5d-34b214ff83d7', NULL, true);

-- Films
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('Who directed the film "Jurassic Park"?', 'Steven Spielberg', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Which movie features the quote "I''ll be back"?', 'The Terminator', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Who played Jack in "Titanic"?', 'Leonardo DiCaprio', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Which film won Best Picture at the 2020 Oscars?', 'Parasite', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('What is the highest-grossing film of all time?', 'Avatar', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Who is the main character in "The Matrix"?', 'Neo', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Which film series features a character named Frodo?', 'The Lord of the Rings', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Who voiced Woody in "Toy Story"?', 'Tom Hanks', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('Which movie is about a clownfish searching for his son?', 'Finding Nemo', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true),
('What is the name of the wizarding school in "Harry Potter"?', 'Hogwarts', 'edb2579f-e8eb-4d3e-9bb1-6a681dbc172a', NULL, true);

-- History
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('Who was the first President of the United States?', 'George Washington', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('In which year did World War II end?', '1945', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('Who wrote the Declaration of Independence?', 'Thomas Jefferson', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('What ancient wonder was located in Alexandria, Egypt?', 'The Lighthouse of Alexandria', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('Who was the first Emperor of China?', 'Qin Shi Huang', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('What year did the Berlin Wall fall?', '1989', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('Who was the first woman to win a Nobel Prize?', 'Marie Curie', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('What was the name of the first successful English colony in America?', 'Jamestown', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('Which empire was ruled by Aztecs?', 'The Aztec Empire', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true),
('Who painted the Mona Lisa?', 'Leonardo da Vinci', '9729677f-8a61-4e13-8783-3eec8b16f770', NULL, true);

-- Art
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('Who painted "The Starry Night"?', 'Vincent van Gogh', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who is known as the "Father of Modern Art"?', 'Pablo Picasso', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who painted the ceiling of the Sistine Chapel?', 'Michelangelo', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who sculpted "David"?', 'Michelangelo', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Which artist is famous for the "Campbell''s Soup Cans"?', 'Andy Warhol', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who painted "Girl with a Pearl Earring"?', 'Johannes Vermeer', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who created the sculpture "The Thinker"?', 'Auguste Rodin', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Which artist is known for surrealist paintings like "The Persistence of Memory"?', 'Salvador Dalí', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who painted "Guernica"?', 'Pablo Picasso', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true),
('Who is the artist behind "The Kiss"?', 'Gustav Klimt', '2ac224d8-9ace-4435-8390-7c09de29e6cb', NULL, true);

-- People
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('Who developed the theory of relativity?', 'Albert Einstein', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who was the first person to walk on the moon?', 'Neil Armstrong', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is known as the "Father of Computers"?', 'Charles Babbage', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the founder of Microsoft?', 'Bill Gates', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the current Queen of the United Kingdom?', 'Camilla', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the author of "Harry Potter"?', 'J.K. Rowling', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the famous civil rights leader who gave the "I Have a Dream" speech?', 'Martin Luther King Jr.', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the founder of SpaceX?', 'Elon Musk', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the first female Prime Minister of the UK?', 'Margaret Thatcher', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true),
('Who is the famous Indian leader known as the "Father of the Nation"?', 'Mahatma Gandhi', 'acdca5ea-e82d-4da6-b5fe-88b94ab4a7d4', NULL, true);

-- Animals
INSERT INTO cards (question, answer, subject_id, creator_id, is_public) VALUES
('What is the largest mammal in the world?', 'Blue whale', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('Which animal is known as the King of the Jungle?', 'Lion', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('What is the fastest land animal?', 'Cheetah', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('Which bird is known for its colorful tail feathers?', 'Peacock', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('What is the only mammal capable of true flight?', 'Bat', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('Which animal is famous for its black and white stripes?', 'Zebra', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('What is the tallest animal in the world?', 'Giraffe', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('Which animal is known for building dams?', 'Beaver', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('What is the largest species of shark?', 'Whale shark', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true),
('Which animal is the symbol of the World Wildlife Fund (WWF)?', 'Giant panda', '6df22e18-0389-4f37-a5c0-7301e62f0476', NULL, true); 
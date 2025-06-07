// Define the questions array
const questions = [
    {
        id: 1,
        question: "What is JavaScript?",
        answer: "JavaScript is a high-level, interpreted programming language primarily used for creating interactive web applications."
    },
    {
        id: 2,
        question: "What is the DOM?",
        answer: "The Document Object Model (DOM) is a programming interface for HTML documents that represents the page as a tree-like structure of objects."
    },
    {
        id: 3,
        question: "What is CSS?",
        answer: "Cascading Style Sheets (CSS) is a style sheet language used for describing the presentation of a document written in HTML."
    }
];

// Make questions array globally accessible
if (typeof window !== 'undefined') {
    window.questions = questions;
} 
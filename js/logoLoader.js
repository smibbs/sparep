// logoLoader.js - Module to load and insert the logo component

export async function loadLogo() {
    try {
        const response = await fetch('components/logo.html');
        if (!response.ok) {
            throw new Error(`Failed to load logo: ${response.status}`);
        }
        const logoHTML = await response.text();
        
        // Detect page type and insert logo accordingly
        const currentPage = getCurrentPageType();
        
        if (currentPage === 'login') {
            insertLogoInLoginPage(logoHTML);
        } else if (['index', 'dashboard', 'admin', 'profile'].includes(currentPage)) {
            insertLogoInMainPages(logoHTML);
        } else {
            // Default behavior for other pages
            insertLogoAtTop(logoHTML);
        }
        
        return true;
    } catch (error) {
        console.error('Error loading logo:', error);
        return false;
    }
}

function getCurrentPageType() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    
    if (filename.includes('login')) return 'login';
    if (filename.includes('dashboard')) return 'dashboard';
    if (filename.includes('admin')) return 'admin';
    if (filename.includes('profile')) return 'profile';
    if (filename.includes('index') || filename === '' || filename === '/') return 'index';
    
    return 'other';
}

function insertLogoInLoginPage(logoHTML) {
    // Find and replace the "Flashcard App" h1 text with logo
    const authHeader = document.querySelector('.auth-header h1');
    if (authHeader && authHeader.textContent.includes('Flashcard App')) {
        const logoContainer = document.createElement('div');
        logoContainer.innerHTML = logoHTML;
        
        // Extract style, header, and logo link
        const style = logoContainer.querySelector('style');
        const headerOriginal = logoContainer.querySelector('.site-header');
        const logoLinkOriginal = logoContainer.querySelector('.app-logo');
        
        if (style && logoLinkOriginal) {
            // Clone the logo link and modify for login page
            const logoLink = logoLinkOriginal.cloneNode(true);
            logoLink.classList.add('login-logo');
            
            // On login page, clicking logo should refresh the page instead of redirecting
            logoLink.href = 'login.html';
            
            // Also insert header background for login page
            if (headerOriginal) {
                const header = headerOriginal.cloneNode(true);
                document.body.appendChild(header);
            }
            
            // Add login-specific styling (styles from logo component will handle positioning)
            const loginStyle = document.createElement('style');
            loginStyle.textContent = style.textContent;
            
            // Insert style in head
            document.head.appendChild(loginStyle);
            
            // Replace h1 with logo
            authHeader.parentNode.replaceChild(logoLink, authHeader);
        }
    }
}

function insertLogoInMainPages(logoHTML) {
    // Use truly fixed positioning for main pages to ensure logo is at top of viewport
    insertLogoAtTopFixed(logoHTML);
}

function insertLogoInPageContent(logoHTML) {
    // Insert logo at the top center of page content for slide menu pages
    const contentAreas = [
        document.getElementById('app-container'),
        document.getElementById('dashboard-container'),
        document.getElementById('profile-container'),
        document.querySelector('.content')
    ];
    
    const targetContainer = contentAreas.find(container => container && container.offsetParent !== null);
    
    if (targetContainer) {
        const logoContainer = document.createElement('div');
        logoContainer.innerHTML = logoHTML;
        
        // Extract style and logo link
        const style = logoContainer.querySelector('style');
        const logoLinkOriginal = logoContainer.querySelector('.app-logo');
        
        if (style && logoLinkOriginal) {
            // Clone the logo link and modify for page content placement
            const logoLink = logoLinkOriginal.cloneNode(true);
            logoLink.classList.add('page-content-logo');
            
            // Add page content specific styling
            const pageStyle = document.createElement('style');
            pageStyle.textContent = style.textContent + `
                .page-content-logo {
                    margin: 20px auto 40px auto !important;
                    text-align: center;
                    position: relative !important;
                    top: auto !important;
                    left: auto !important;
                    transform: none !important;
                    z-index: 10;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                }
                .page-content-logo .micro {
                    font-size: 16px;
                    width: 76px; /* Adjusted for 'nano' */
                }
                .page-content-logo .boxed {
                    font-size: 28px;
                    width: 81px; /* Adjusted for 'topic' */
                    padding: 4px 10px;
                }
                
                /* Responsive adjustments for page content logo */
                @media (max-width: 768px) {
                    .page-content-logo {
                        margin: 15px auto 30px auto !important;
                        position: relative !important;
                        top: auto !important;
                        left: auto !important;
                        transform: none !important;
                    }
                    .page-content-logo .micro {
                        font-size: 14px;
                        width: 67px; /* Adjusted for mobile 'nano' */
                    }
                    .page-content-logo .boxed {
                        font-size: 24px;
                        width: 68px; /* Adjusted for mobile 'topic' */
                        padding: 3px 8px;
                    }
                }
            `;
            
            // Insert style in head
            document.head.appendChild(pageStyle);
            
            // Insert logo as first child of content container
            targetContainer.insertBefore(logoLink, targetContainer.firstChild);
        }
    }
}

function insertLogoAtTopFixed(logoHTML) {
    // Insert header background and logo with true fixed positioning at top of viewport
    const logoContainer = document.createElement('div');
    logoContainer.innerHTML = logoHTML;
    
    // Extract style, header background, and logo link
    const style = logoContainer.querySelector('style');
    const headerOriginal = logoContainer.querySelector('.site-header');
    const logoLinkOriginal = logoContainer.querySelector('.app-logo');
    
    if (style && headerOriginal && logoLinkOriginal) {
        // Clone the elements
        const header = headerOriginal.cloneNode(true);
        const logoLink = logoLinkOriginal.cloneNode(true);
        
        // Add the style to head
        document.head.appendChild(style);
        
        // Insert header background first (lower z-index)
        document.body.appendChild(header);
        
        // Insert logo on top of header (higher z-index)
        document.body.appendChild(logoLink);
    }
}

function insertLogoAtTop(logoHTML) {
    // Default behavior - insert at top of page
    const firstChild = document.body.firstChild;
    const logoContainer = document.createElement('div');
    logoContainer.innerHTML = logoHTML;
    
    // Insert all the logo content (style + div)
    while (logoContainer.firstChild) {
        document.body.insertBefore(logoContainer.firstChild, firstChild);
    }
}

// Auto-load logo when this module is imported
document.addEventListener('DOMContentLoaded', loadLogo);
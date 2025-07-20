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
        
        // Extract style and logo div
        const style = logoContainer.querySelector('style');
        const logoDivOriginal = logoContainer.querySelector('.app-logo');
        
        if (style && logoDivOriginal) {
            // Clone the logo div and modify for login page
            const logoDiv = logoDivOriginal.cloneNode(true);
            logoDiv.classList.add('login-logo');
            
            // Add login-specific styling (styles from logo component will handle positioning)
            const loginStyle = document.createElement('style');
            loginStyle.textContent = style.textContent;
            
            // Insert style in head
            document.head.appendChild(loginStyle);
            
            // Replace h1 with logo
            authHeader.parentNode.replaceChild(logoDiv, authHeader);
        }
    }
}

function insertLogoInMainPages(logoHTML) {
    // Always insert logo in page content for main pages (since we removed the old header nav)
    insertLogoInPageContent(logoHTML);
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
        
        // Extract style and logo div
        const style = logoContainer.querySelector('style');
        const logoDivOriginal = logoContainer.querySelector('.app-logo');
        
        if (style && logoDivOriginal) {
            // Clone the logo div and modify for page content placement
            const logoDiv = logoDivOriginal.cloneNode(true);
            logoDiv.classList.add('page-content-logo');
            
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
                    width: 95px;
                }
                .page-content-logo .boxed {
                    font-size: 28px;
                    width: 72px;
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
                        width: 84px;
                    }
                    .page-content-logo .boxed {
                        font-size: 24px;
                        width: 60px;
                        padding: 3px 8px;
                    }
                }
            `;
            
            // Insert style in head
            document.head.appendChild(pageStyle);
            
            // Insert logo as first child of content container
            targetContainer.insertBefore(logoDiv, targetContainer.firstChild);
        }
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
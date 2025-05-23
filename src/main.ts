import { Plugin, MarkdownPostProcessorContext, TFile, MarkdownView } from 'obsidian';
import { PeopleTrackerSettings, PeopleTrackerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class PeopleTrackerPlugin extends Plugin {
    settings!: PeopleTrackerSettings;
    private processTimer: NodeJS.Timeout | null = null;

    async onload() {
        console.log('=============================');
        console.log('People Tracker Plugin Loading');
        console.log('=============================');
        
        await this.loadSettings();
        this.addSettingTab(new PeopleTrackerSettingTab(this.app, this));

        // Register for file opens
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!file) return;
                this.processCurrentView();
            })
        );

        // Register markdown processor for live updates
        this.registerMarkdownPostProcessor((el, ctx) => {
            this.processSection(el, ctx);
        });
        
        // Register for editor changes with aggressive reprocessing
        this.registerEditorEvents();
    }

    private registerEditorEvents() {
        // Process on editor focus and changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.processCurrentView();
                // Reprocess after a delay to catch any redraws
                setTimeout(() => this.processCurrentView(), 200);
            })
        );

        // Process on any editor change
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.processCurrentView();
                // Reprocess after a delay
                setTimeout(() => this.processCurrentView(), 100);
            })
        );

        // Monitor DOM mutations in the editor
        const observer = new MutationObserver((mutations) => {
            const shouldProcess = mutations.some(mutation => {
                // Only process if we see relevant class changes or content changes
                return (
                    mutation.type === 'attributes' && mutation.attributeName === 'class' ||
                    mutation.type === 'childList' ||
                    mutation.type === 'characterData'
                );
            });
            
            if (shouldProcess) {
                this.processCurrentView();
            }
        });

        // Update observer when layout changes
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    observer.observe(view.contentEl, {
                        childList: true,
                        subtree: true,
                        characterData: true,
                        attributes: true,
                        attributeFilter: ['class']
                    });
                }
            })
        );
    }

    private processCurrentView() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        // Clear any existing timer
        if (this.processTimer) {
            clearTimeout(this.processTimer);
        }

        // Process immediately
        this.processAllLinksInView(view);

        // Schedule another process after a delay to catch any redraws
        this.processTimer = setTimeout(() => {
            this.processAllLinksInView(view);
        }, 100);
    }

    private processSection(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        const links = el.querySelectorAll('a.internal-link');
        links.forEach(linkEl => {
            if ((linkEl as HTMLElement).hasClass('person-link-processed')) return;
            
            const href = decodeURIComponent(linkEl.getAttribute('href') || '');
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(href, ctx.sourcePath);
            
            if (targetFile && targetFile.path.replace(/\\/g, '/').startsWith('Sets/People/')) {
                const cache = this.app.metadataCache.getFileCache(targetFile);
                if (cache?.frontmatter?.avatar) {
                    this.processPersonLink(linkEl as HTMLElement, cache);
                }
            }
        });
    }

    private processAllLinksInView(view: MarkdownView) {
        const container = view.contentEl;
        
        // Get both wiki-links and internal links
        const allLinks = Array.from(container.querySelectorAll([
            'a.internal-link',                      // Preview mode links
            '.cm-line .cm-underline',             // Editor mode link text
            '.cm-line .cm-hmd-internal-link'      // Editor mode containers
        ].join(', ')));
        
        allLinks.forEach(linkEl => {
            // Skip already processed elements to prevent duplication
            if ((linkEl as HTMLElement).hasClass('person-link-processed')) return;
            
            // For editor mode, we need to find the right element to process
            const linkElement = linkEl as HTMLElement;
            let elementToProcess: HTMLElement;
            
            if (linkElement.classList.contains('cm-underline')) {
                const container = linkElement.closest('.cm-hmd-internal-link');
                elementToProcess = (container as HTMLElement) || linkElement;
            } else if (linkElement.classList.contains('cm-hmd-internal-link')) {
                elementToProcess = linkElement;
            } else {
                elementToProcess = linkElement;
            }
            
            if (!elementToProcess || (elementToProcess as HTMLElement).hasClass('person-link-processed')) return;
            
            const text = linkEl.textContent || '';
            const href = (linkEl as HTMLElement).getAttribute('href');
            const linkPath = href || text;
            
            if (!linkPath) return;
            
            const file = this.app.metadataCache.getFirstLinkpathDest(
                decodeURIComponent(linkPath), 
                view.file?.path || ''
            );
            
            if (file && file.path.replace(/\\/g, '/').startsWith('Sets/People/')) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.avatar) {
                    this.processPersonLink(linkEl as HTMLElement, cache);
                }
            }
        });
    }

    processPersonLink(linkEl: HTMLElement, cache: any) {
        if (linkEl.hasClass('person-link-processed')) return;
        
        const avatarName = cache.frontmatter.avatar;
        if (!avatarName) return;
        
        // For editor mode links, we need to handle both the link and container elements
        const parentElement = linkEl.closest('.cm-hmd-internal-link') || linkEl.closest('.HyperMD-link_link');
        const elementToProcess = (parentElement || linkEl) as HTMLElement;
        
        // Combine settings path with avatar name
        const avatarPath = `${this.settings.avatarFolderPath}/${avatarName}`;
        const imageUrl = this.app.vault.adapter.getResourcePath(avatarPath);
        
        // Set data attributes and CSS variables
        elementToProcess.setAttribute('data-link-avatar', imageUrl);
        elementToProcess.style.setProperty('--data-link-avatar', `url(${imageUrl})`);
        
        // Add necessary classes to both parent and link elements
        elementToProcess.addClass('data-link-icon');
        elementToProcess.addClass('person-link');
        elementToProcess.addClass('person-link-processed');
        
        // If this is an editor link, also style the underline element
        if (parentElement && linkEl !== parentElement) {
            linkEl.addClass('data-link-icon');
            linkEl.addClass('person-link');
        }
        
        console.log('Processed link with avatar:', {
            type: parentElement ? 'editor' : 'preview',
            element: elementToProcess.outerHTML,
            classes: elementToProcess.className,
            style: elementToProcess.getAttribute('style')
        });
    }
    
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('People Tracker unloaded');
    }
}
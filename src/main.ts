import { Plugin, MarkdownPostProcessorContext, TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { PeopleTrackerSettings, PeopleTrackerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class PeopleTrackerPlugin extends Plugin {
    settings!: PeopleTrackerSettings;
    private processTimer: NodeJS.Timeout | null = null;

    private tryGetLinkTarget(element: HTMLElement, sourcePath: string): TFile | null {
        // For editor mode links, prioritize text content
        if (element.classList.contains('cm-underline') && element.textContent) {
            try {
                const cleanPath = this.cleanLinkPath(element.textContent, true);
                const file = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
                if (file) return file;
            } catch (e) {
                console.debug('Error with underline text:', element.textContent, e);
            }
        }

        // Try URL attributes next
        for (const attr of ['data-href', 'href']) {
            const path = element.getAttribute(attr);
            if (!path) continue;
            try {
                const cleanPath = this.cleanLinkPath(path, false);
                const file = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
                if (file) return file;
            } catch (e) {
                console.debug(`Error with ${attr}:`, path, e);
            }
        }

        // Finally try regular text content
        if (element.textContent && !element.classList.contains('cm-underline')) {
            try {
                const cleanPath = this.cleanLinkPath(element.textContent, true);
                return this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
            } catch (e) {
                console.debug('Error with text content:', element.textContent, e);
            }
        }

        return null;
    }

    private cleanLinkPath(path: string, isTextContent: boolean = false): string {
        if (!path) return '';

        // Remove any leading or trailing whitespace
        path = path.trim();

        // Handle aliases by taking the part before the | if it exists
        if (path.includes('|')) {
            path = path.split('|')[0].trim();
        }

        // Handle display text in editor mode by taking the part before the ]] if it exists
        if (path.includes(']]')) {
            path = path.split(']]')[0].trim();
        }

        // Handle markdown links by taking the part after [[ if it exists
        if (path.includes('[[')) {
            path = path.split('[[').pop()?.trim() || path;
        }

        // For text content (like "93% Lean"), just normalize whitespace and return as-is
        if (isTextContent) {
            return path.replace(/\s+/g, ' ');
        }

        // For URLs, properly encode all special characters
        try {
            // First check if it's already a valid URL-encoded string
            decodeURIComponent(path);
            return path;
        } catch (e) {
            // If not, encode special characters
            return path.replace(/[%\[\]|&?#]/g, (match) => {
                switch (match) {
                    case '%': return '%25';
                    case '[': return '%5B';
                    case ']': return '%5D';
                    case '|': return '%7C';
                    case '&': return '%26';
                    case '?': return '%3F';
                    case '#': return '%23';
                    default: return match;
                }
            }).replace(/\s+/g, ' ');
        }
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new PeopleTrackerSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('file-open', () => this.processCurrentView())
        );

        this.registerMarkdownPostProcessor((el, ctx) => this.processSection(el, ctx));
        this.registerEditorEvents();
    }

    private registerEditorEvents() {
        // Handle editor state changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.handleEditorChange())
        );
        this.registerEvent(
            this.app.workspace.on('editor-change', () => this.handleEditorChange())
        );

        // Monitor editor mutations
        const observer = new MutationObserver((mutations) => {
            if (mutations.some(m =>
                m.type === 'attributes' && m.attributeName === 'class' ||
                m.type === 'childList' ||
                m.type === 'characterData'
            )) {
                this.processCurrentView();
            }
        });

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

    private handleEditorChange() {
        this.processCurrentView();
        setTimeout(() => this.processCurrentView(), 100);
    }

    private processCurrentView() {
        if (this.processTimer) clearTimeout(this.processTimer);

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        // Process immediately and schedule a follow-up
        this.processAllLinksInView(view);
        this.processTimer = setTimeout(() => this.processAllLinksInView(view), 100);
    }

    private processSection(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        try {
            el.querySelectorAll('a.internal-link').forEach(linkEl => {
                try {
                    const element = linkEl as HTMLElement;
                    if (element.hasClass('person-link-processed')) return;

                    const targetFile = this.tryGetLinkTarget(element, ctx.sourcePath);
                    if (!targetFile) return;

                    if (targetFile.path.startsWith(this.settings.peopleFolderPath)) {
                        const cache = this.app.metadataCache.getFileCache(targetFile);
                        if (cache?.frontmatter?.avatar) {
                            this.processPersonLink(element, cache);
                        }
                    }
                } catch (e) {
                    console.debug('Error processing link in section:', e);
                }
            });
        } catch (e) {
            console.debug('Error in processSection:', e);
        }
    }

    private processAllLinksInView(view: MarkdownView) {
        if (!view?.contentEl?.isConnected) return;

        try {
            const links = Array.from(view.contentEl.querySelectorAll([
                'a.internal-link',                // Preview mode links
                '.cm-underline',                 // Editor mode link text (anywhere)
                '.cm-hmd-internal-link'         // Editor mode containers (anywhere)
            ].join(', ')));

            links.forEach(linkEl => {
                try {
                    const element = linkEl as HTMLElement;
                    if (element.hasClass('person-link-processed')) return;

                    // Determine the element to process
                    let elementToProcess = element;
                    if (element.classList.contains('cm-underline')) {
                        const container = element.closest('.cm-hmd-internal-link');
                        elementToProcess = (container as HTMLElement) || element;
                    }

                    const targetFile = this.tryGetLinkTarget(element, view.file?.path || '');
                    if (!targetFile) return;

                    if (targetFile.path.startsWith(this.settings.peopleFolderPath)) {
                        const cache = this.app.metadataCache.getFileCache(targetFile);
                        if (cache?.frontmatter?.avatar) {
                            this.processPersonLink(elementToProcess, cache);
                        }
                    }
                } catch (e) {
                    console.debug('Error processing link:', e);
                }
            });
        } catch (e) {
            console.debug('Error in processAllLinksInView:', e);
        }
    }

    private processPersonLink(linkEl: HTMLElement, cache: any) {
        const avatarName = cache.frontmatter.avatar;
        if (!avatarName) return;

        // Check for valid avatar name and required settings
        if (!this.settings.avatarFolderPath) {
            console.warn('Avatar folder path not configured in settings');
            return;
        }

        // Determine elements to style
        const parentElement = linkEl.closest('.cm-hmd-internal-link');
        const elementToProcess = (parentElement || linkEl) as HTMLElement;

        // Set up the avatar
        const avatarPath = `${this.settings.avatarFolderPath}/${avatarName}`;

        // Validate that the avatar file exists
        if (!this.app.vault.adapter.exists(avatarPath)) {
            console.warn(`Avatar file not found: ${avatarPath}`);
            return;
        }

        const imageUrl = this.app.vault.adapter.getResourcePath(avatarPath);

        // Apply styles
        elementToProcess.setAttribute('data-link-avatar', imageUrl);
        elementToProcess.style.setProperty('--data-link-avatar', `url(${imageUrl})`);
        elementToProcess.addClass('data-link-icon', 'person-link', 'person-link-processed');

        // Style the underline element in editor mode
        if (parentElement && linkEl !== parentElement) {
            linkEl.addClass('data-link-icon', 'person-link');
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        // Validate paths before saving
        if (!this.settings.avatarFolderPath) {
            console.warn('Avatar folder path is required');
            return;
        }
        if (!this.settings.peopleFolderPath) {
            console.warn('People folder path is required');
            return;
        }

        // Check if the paths exist in the vault
        if (!await this.app.vault.adapter.exists(this.settings.avatarFolderPath)) {
            console.warn(`Avatar folder does not exist: ${this.settings.avatarFolderPath}`);
            return;
        }
        if (!await this.app.vault.adapter.exists(this.settings.peopleFolderPath)) {
            console.warn(`People folder does not exist: ${this.settings.peopleFolderPath}`);
            return;
        }

        await this.saveData(this.settings);
    }
}
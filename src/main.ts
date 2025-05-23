import { Plugin, MarkdownPostProcessorContext, TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { PeopleTrackerSettings, PeopleTrackerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class PeopleTrackerPlugin extends Plugin {
    settings!: PeopleTrackerSettings;
    private processTimer: NodeJS.Timeout | null = null;

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
        el.querySelectorAll('a.internal-link').forEach(linkEl => {
            if ((linkEl as HTMLElement).hasClass('person-link-processed')) return;

            const href = decodeURIComponent(linkEl.getAttribute('href') || '');
            const targetFile = this.app.metadataCache.getFirstLinkpathDest(href, ctx.sourcePath);

            if (targetFile?.path.startsWith(this.settings.peopleFolderPath)) {
                const cache = this.app.metadataCache.getFileCache(targetFile);
                if (cache?.frontmatter?.avatar) {
                    this.processPersonLink(linkEl as HTMLElement, cache);
                }
            }
        });
    }

    private processAllLinksInView(view: MarkdownView) {
        const links = Array.from(view.contentEl.querySelectorAll([
            'a.internal-link',                // Preview mode links
            '.cm-underline',                 // Editor mode link text (anywhere)
            '.cm-hmd-internal-link'         // Editor mode containers (anywhere)
        ].join(', ')));

        links.forEach(linkEl => {
            const linkElement = linkEl as HTMLElement;
            if (linkElement.hasClass('person-link-processed')) return;

            // Determine the element to process
            let elementToProcess = linkElement;
            if (linkElement.classList.contains('cm-underline')) {
                const container = linkElement.closest('.cm-hmd-internal-link');
                elementToProcess = (container as HTMLElement) || linkElement;
            }

            const text = linkElement.textContent || '';
            // Check both href and data-href for footer links
            const href = linkElement.getAttribute('href') || linkElement.getAttribute('data-href');
            const linkPath = href || text;

            if (!linkPath) return;

            const file = this.app.metadataCache.getFirstLinkpathDest(
                decodeURIComponent(linkPath),
                view.file?.path || ''
            );

            if (file?.path.startsWith(this.settings.peopleFolderPath)) {
                const cache = this.app.metadataCache.getFileCache(file);
                if (cache?.frontmatter?.avatar) {
                    this.processPersonLink(linkElement, cache);
                }
            }
        });
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
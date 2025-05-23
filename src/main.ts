import { Plugin, MarkdownPostProcessorContext, TFile, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { PeopleTrackerSettings, PeopleTrackerSettingTab, DEFAULT_SETTINGS } from './settings';

export default class PeopleTrackerPlugin extends Plugin {
    settings!: PeopleTrackerSettings;
    private processTimer: NodeJS.Timeout | null = null; private tryGetLinkTarget(element: HTMLElement, sourcePath: string): TFile | null {
        const linkText = element.textContent?.trim();
        if (!linkText) return null;

        try {
            return this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
        } catch (e) {
            console.debug('Error processing link:', linkText, e);
            return null;
        }
    } async onload() {
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
                    if (!targetFile) return;                    if (targetFile.path.startsWith(this.settings.peopleFolderPath)) {
                        const cache = this.app.metadataCache.getFileCache(targetFile);
                        // Only process if we have avatars enabled and either an avatar is defined or we want to show the default
                        if (this.settings.enableAvatars) {
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
                    if (!targetFile) return;                    if (targetFile.path.startsWith(this.settings.peopleFolderPath)) {
                        const cache = this.app.metadataCache.getFileCache(targetFile);
                        if (this.settings.enableAvatars) {
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
    }    // Store the default avatar SVG as a static property to avoid recreating it
    private static readonly defaultAvatarSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g clip-path="url(#clip0_15_82)"> <rect width="24" height="24" fill="white"></rect> <g filter="url(#filter0_d_15_82)"> <path d="M14.3365 12.3466L14.0765 11.9195C13.9082 12.022 13.8158 12.2137 13.8405 12.4092C13.8651 12.6046 14.0022 12.7674 14.1907 12.8249L14.3365 12.3466ZM9.6634 12.3466L9.80923 12.8249C9.99769 12.7674 10.1348 12.6046 10.1595 12.4092C10.1841 12.2137 10.0917 12.022 9.92339 11.9195L9.6634 12.3466ZM4.06161 19.002L3.56544 18.9402L4.06161 19.002ZM19.9383 19.002L20.4345 18.9402L19.9383 19.002ZM16 8.5C16 9.94799 15.2309 11.2168 14.0765 11.9195L14.5965 12.7737C16.0365 11.8971 17 10.3113 17 8.5H16ZM12 4.5C14.2091 4.5 16 6.29086 16 8.5H17C17 5.73858 14.7614 3.5 12 3.5V4.5ZM7.99996 8.5C7.99996 6.29086 9.79082 4.5 12 4.5V3.5C9.23854 3.5 6.99996 5.73858 6.99996 8.5H7.99996ZM9.92339 11.9195C8.76904 11.2168 7.99996 9.948 7.99996 8.5H6.99996C6.99996 10.3113 7.96342 11.8971 9.40342 12.7737L9.92339 11.9195ZM9.51758 11.8683C6.36083 12.8309 3.98356 15.5804 3.56544 18.9402L4.55778 19.0637C4.92638 16.1018 7.02381 13.6742 9.80923 12.8249L9.51758 11.8683ZM3.56544 18.9402C3.45493 19.8282 4.19055 20.5 4.99996 20.5V19.5C4.70481 19.5 4.53188 19.2719 4.55778 19.0637L3.56544 18.9402ZM4.99996 20.5H19V19.5H4.99996V20.5ZM19 20.5C19.8094 20.5 20.545 19.8282 20.4345 18.9402L19.4421 19.0637C19.468 19.2719 19.2951 19.5 19 19.5V20.5ZM20.4345 18.9402C20.0164 15.5804 17.6391 12.8309 14.4823 11.8683L14.1907 12.8249C16.9761 13.6742 19.0735 16.1018 19.4421 19.0637L20.4345 18.9402Z" fill="currentColor"></path> </g> </g> <defs> <filter id="filter0_d_15_82" x="2.55444" y="3.5" width="18.8911" height="19" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"> <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood> <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"></feColorMatrix> <feOffset dy="1"></feOffset> <feGaussianBlur stdDeviation="0.5"></feGaussianBlur> <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"></feColorMatrix> <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_15_82"></feBlend> <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_15_82" result="shape"></feBlend> </filter> <clipPath id="clip0_15_82"> <rect width="24" height="24" fill="white"></rect> </clipPath> </defs> </g></svg>`;

    private processPersonLink(linkEl: HTMLElement, cache: any) {
        // Skip if already processed to prevent loops
        if (linkEl.hasClass('person-link-processed')) return;

        let imageUrl: string;

        if (!cache.frontmatter?.avatar) {
            // Use default SVG avatar
            imageUrl = `data:image/svg+xml,${encodeURIComponent(PeopleTrackerPlugin.defaultAvatarSvg)}`;
        } else {
            // Use configured avatar image
            const avatarPath = `${this.settings.avatarFolderPath}/${cache.frontmatter.avatar}`;

            // Validate that the avatar file exists
            if (!this.settings.avatarFolderPath || !this.app.vault.adapter.exists(avatarPath)) {
                // Fall back to default avatar if the configured one doesn't exist
                imageUrl = `data:image/svg+xml,${encodeURIComponent(PeopleTrackerPlugin.defaultAvatarSvg)}`;
            } else {
                imageUrl = this.app.vault.adapter.getResourcePath(avatarPath);
            }
        }

        // Determine elements to style
        const parentElement = linkEl.closest('.cm-hmd-internal-link');
        const elementToProcess = (parentElement || linkEl) as HTMLElement;

        // Apply styles
        elementToProcess.setAttribute('data-link-avatar', imageUrl);
        elementToProcess.style.setProperty('--data-link-avatar', `url('${imageUrl}')`);
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
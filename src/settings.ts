import { App, PluginSettingTab, Setting, TFolder, TAbstractFile, AbstractInputSuggest } from 'obsidian';
import PeopleTrackerPlugin from './main';

interface PeopleTrackerSettings {
    enableAvatars: boolean;
    avatarFolderPath: string;
    peopleFolderPath: string;
}

const DEFAULT_SETTINGS: PeopleTrackerSettings = {
    enableAvatars: true,
    avatarFolderPath: '',
    peopleFolderPath: 'Sets/People'
};

class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, private inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((file: TAbstractFile) => {
            if (
                file instanceof TFolder &&
                file.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                folders.push(file);
            }
        });

        return folders;
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        this.inputEl.value = folder.path;
        this.inputEl.trigger("input");
        this.close();
    }
}

export class PeopleTrackerSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: PeopleTrackerPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'People Tracker Settings' });

        new Setting(containerEl)
            .setName('Enable avatars')
            .setDesc('Show avatars next to people links')
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.enableAvatars)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAvatars = value;
                        // Force refresh of the settings panel to show/hide avatar path
                        this.display();
                        await this.plugin.saveSettings();
                    })
            );

        if (this.plugin.settings.enableAvatars) {
            const avatarSetting = new Setting(containerEl)
                .setName('Avatar folder path')
                .setDesc('Path to folder containing avatar images')
                .addText(text => {
                    new FolderSuggest(this.app, text.inputEl);
                    text.setPlaceholder('Example: _Meta/Avatars')
                        .setValue(this.plugin.settings.avatarFolderPath)
                        .onChange(async (value) => {
                            this.plugin.settings.avatarFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                });

            // Add indentation to the setting
            avatarSetting.settingEl.style.paddingLeft = '2em';
        }

        new Setting(containerEl)
            .setName('People folder path')
            .setDesc('Path to folder containing people notes')
            .addText(text => {
                new FolderSuggest(this.app, text.inputEl);
                text.setPlaceholder('Example: Sets/People')
                    .setValue(this.plugin.settings.peopleFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.peopleFolderPath = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

export type { PeopleTrackerSettings };
export { DEFAULT_SETTINGS };
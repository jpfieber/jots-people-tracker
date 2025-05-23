import { App, PluginSettingTab, Setting, TFolder, TAbstractFile } from 'obsidian';
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
                .addDropdown(dropdown =>
                    dropdown
                        .addOptions(this.getFolderOptions())
                        .setValue(this.plugin.settings.avatarFolderPath)
                        .onChange(async (value) => {
                            this.plugin.settings.avatarFolderPath = value;
                            await this.plugin.saveSettings();
                        })
                );

            // Add indentation to the setting
            avatarSetting.settingEl.style.paddingLeft = '2em';
        }

        new Setting(containerEl)
            .setName('People folder path')
            .setDesc('Path to folder containing people notes')
            .addDropdown(dropdown =>
                dropdown
                    .addOptions(this.getFolderOptions())
                    .setValue(this.plugin.settings.peopleFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.peopleFolderPath = value;
                        await this.plugin.saveSettings();
                    })
            );
    }

    private getFolderOptions(): Record<string, string> {
        const folders: Record<string, string> = {};
        this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .forEach(folder => {
                folders[folder.path] = folder.path;
            });
        return folders;
    }
}

export type { PeopleTrackerSettings };
export { DEFAULT_SETTINGS };
import { App, PluginSettingTab, Setting, TFolder, TAbstractFile } from 'obsidian';
import PeopleTrackerPlugin from './main';

interface PeopleTrackerSettings {
    avatarFolderPath: string;
    peopleFolderPath: string;
}

const DEFAULT_SETTINGS: PeopleTrackerSettings = {
    avatarFolderPath: '',
    peopleFolderPath: ''
};

export class PeopleTrackerSettingTab extends PluginSettingTab {
    plugin: PeopleTrackerPlugin;

    constructor(app: App, plugin: PeopleTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'People Tracker Settings' });

        new Setting(containerEl)
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
            .filter((f: TAbstractFile) => f instanceof TFolder)
            .forEach((folder: TAbstractFile) => {
                folders[folder.path] = folder.path;
            });
        return folders;
    }
}

export type { PeopleTrackerSettings };
export { DEFAULT_SETTINGS };
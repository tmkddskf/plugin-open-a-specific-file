import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface FileConfig {
	name: string;
	path: string;
	commandId: string;
}

interface OpenSpecificFileSettings {
	fileConfigs: FileConfig[];
	enableDailyNote: boolean;
}

const DEFAULT_SETTINGS: OpenSpecificFileSettings = {
	fileConfigs: [],
	enableDailyNote: false
}

export default class OpenSpecificFile extends Plugin {
	settings: OpenSpecificFileSettings;
	private dailyNotesPlugin: any;

	async onload() {
		await this.loadSettings();

		// Get the Daily Notes plugin
		this.dailyNotesPlugin = (this.app as any).internalPlugins?.getPluginById('daily-notes');

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('file-text', 'Open Specific Files', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new FileListModal(this.app, this).open();
		});
		// Perform additional things with the ribbon
		//ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		/*
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');
		*/

		// Register commands for each configured file
		this.registerFileCommands();

		// Register daily note command if enabled
		if (this.settings.enableDailyNote) {
			this.registerDailyNoteCommand();
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new OpenSpecificFileSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		/*
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});
		*/

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		/*
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
		*/
	}

	onunload() {
		// Clean up commands when plugin is disabled
		// No need to manually remove commands as they are automatically cleaned up
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	registerFileCommands() {
		// No need to manually remove commands as they are automatically cleaned up
		// when the plugin is disabled or reloaded

		// Add command to open file list
		this.addCommand({
			id: 'open-specific-file:open-file-list',
			name: 'Open specific file list',
			callback: () => {
				new FileListModal(this.app, this).open();
			}
		});

		// Register commands for each configured file
		this.settings.fileConfigs.forEach(config => {
			this.addCommand({
				id: config.commandId,
				name: `Open ${config.name}`,
				callback: () => {
					this.openFile(config.path);
				}
			});
		});
	}

	registerDailyNoteCommand() {
		this.addCommand({
			id: 'open-specific-file:open-daily-note',
			name: 'Open Daily Note',
			callback: async () => {
				if (!this.dailyNotesPlugin) {
					new Notice('Daily Notes plugin is not enabled');
					return;
				}

				const options = this.dailyNotesPlugin.instance.options;
				const today = new Date();
				
				// Format the date according to the Daily Notes plugin format
				let formattedDate = options.format;
				const dateTokens = {
					'YYYY': today.getFullYear().toString(),
					'YY': today.getFullYear().toString().slice(-2),
					'MM': String(today.getMonth() + 1).padStart(2, '0'),
					'M': String(today.getMonth() + 1),
					'DD': String(today.getDate()).padStart(2, '0'),
					'D': String(today.getDate()),
					'ddd': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()],
					'dddd': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()],
					'HH': String(today.getHours()).padStart(2, '0'),
					'H': String(today.getHours()),
					'mm': String(today.getMinutes()).padStart(2, '0'),
					'm': String(today.getMinutes()),
					'ss': String(today.getSeconds()).padStart(2, '0'),
					's': String(today.getSeconds())
				};

				// Replace all date tokens
				Object.entries(dateTokens).forEach(([token, value]) => {
					formattedDate = formattedDate.replace(new RegExp(token, 'g'), value);
				});

				// Construct the full path
				let path = `${options.folder}${formattedDate}.md`;

				// Check if the file exists
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) {
					// If file doesn't exist, create it with template
					if (options.template) {
						const templateFile = this.app.vault.getAbstractFileByPath(options.template);
						if (templateFile instanceof TFile) {
							const templateContent = await this.app.vault.read(templateFile);
							await this.app.vault.create(path, templateContent);
						}
					}
				}
				// if start with /, remove it
				if (path.startsWith('/')) {
					path = path.slice(1);
				}
				this.openFile(path);
			}
		});
	}

	async openFile(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			// Check if the file is already open
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			const existingLeaf = leaves.find(leaf => {
				const view = leaf.view;
				return view instanceof MarkdownView && view.file?.path === file.path;
			});

			if (existingLeaf) {
				// If file is already open, focus on it
				this.app.workspace.revealLeaf(existingLeaf);
				const view = existingLeaf.view;
				if (view instanceof MarkdownView) {
					view.editor.focus();
				}
			} else {
				// If file is not open, open it in a new leaf
				await this.app.workspace.getLeaf(true).openFile(file);
			}
		} else {
			new Notice(`File not found: ${filePath}`);
		}
	}
}

class FileListModal extends Modal {
	plugin: OpenSpecificFile;

	constructor(app: App, plugin: OpenSpecificFile) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: 'Quick Open Files'});

		const fileList = contentEl.createEl('div', {cls: 'file-list'});
		
		this.plugin.settings.fileConfigs.forEach(config => {
			const fileItem = fileList.createEl('div', {cls: 'file-item'});
			fileItem.createEl('button', {
				text: config.name,
				cls: 'file-button',
			}).addEventListener('click', () => {
				this.plugin.openFile(config.path);
				this.close();
			});
		});

		if (this.plugin.settings.fileConfigs.length === 0) {
			fileList.createEl('div', {
				text: 'No files configured. Please add file configurations in settings.',
				cls: 'no-files-message'
			});
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class OpenSpecificFileSettingTab extends PluginSettingTab {
	plugin: OpenSpecificFile;

	constructor(app: App, plugin: OpenSpecificFile) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'File Configurations'});

		// Add new file configuration
		new Setting(containerEl)
			.setName('Add New File')
			.setDesc('Add a new file configuration')
			.addButton(button => button
				.setButtonText('Add')
				.onClick(() => {
					this.plugin.settings.fileConfigs.push({
						name: 'New File',
						path: '',
						commandId: `open-specific-file:open-${Date.now()}`
					});
					this.plugin.saveSettings();
					this.plugin.registerFileCommands();
					this.display();
				}));

		// Display existing configurations
		this.plugin.settings.fileConfigs.forEach((config, index) => {
			const fileConfigContainer = containerEl.createEl('div', {cls: 'file-config-container'});
			
			new Setting(fileConfigContainer)
				.setName(`File Configuration #${index + 1}`)
				.addText(text => text
					.setPlaceholder('Display Name')
					.setValue(config.name)
					.onChange(async (value) => {
						config.name = value;
						await this.plugin.saveSettings();
						this.plugin.registerFileCommands();
					}))
				.addText(text => text
					.setPlaceholder('File Path')
					.setValue(config.path)
					.onChange(async (value) => {
						config.path = value;
						await this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.fileConfigs.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.registerFileCommands();
						this.display();
					}));
		});

		// Daily Note Configuration
		containerEl.createEl('h2', {text: 'Daily Note Configuration'});
		
		new Setting(containerEl)
			.setName('Enable Daily Note')
			.setDesc('Enable the daily note feature (requires Daily Notes plugin to be enabled)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDailyNote)
				.onChange(async (value) => {
					this.plugin.settings.enableDailyNote = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.registerDailyNoteCommand();
					}
				}));
	}
}

import GObject from 'gi://GObject';
import NM from 'gi://NM';
import GLib from 'gi://GLib';
import St from 'gi://St'; // We need St for the Icon

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'; // This is the panel button
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

// We import gettext for use in the VlanManager class,
// as `this._()` is not available until the main class is instantiated.
import { gettext as _ } from 'gettext';

// Responsible to create the Panel icon and menu
const VlanManager = GObject.registerClass(
    {
        GTypeName: 'VlanManager',
    },
    class VlanManager extends GObject.Object {
        _init() {
            super._init();
            this._client = NM.Client.new(null);
            this._signalIds = [];
            this._refreshTimeoutId = null;

            this._createContainer();

            // Bind to NMClient property changes
            this._signalIds.push(this._client.connect(
                'notify::active-connections', () => this._queueRefresh()
            ));
            this._signalIds.push(this._client.connect(
                'notify::connections', () => this._queueRefresh()
            ));
        }

        // Create the VLAN Indicator on the system panel
        _createContainer() {
            // 1. Create a Panel Button
            this.container = new PanelMenu.Button(0.0, _('VLAN Indicator'));
            
            // 2. Add an icon to the button
            let icon = new St.Icon({
                icon_name: 'network-wired-symbolic',
                style_class: 'system-status-icon'
            });
            
            // 3. --- THIS IS THE FIX ---
            // Use add_child() to add the icon to the PanelMenu.Button
            this.container.add_child(icon);
            // --- END OF FIX ---
            
            // 4. Get the menu from the button
            this.menu = this.container.menu;

            // 5. Add the button to the main panel's status area
            Main.panel.addToStatusArea('vlan-indicator', this.container);

            // 6. Connect the refresh signal
            this.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen) this._refresh();
            });

            // 7. Initial refresh
            this._refresh();
        }

        // Queue a refresh using a debounce timer
        _queueRefresh() {
            if (this._refreshTimeoutId)
                GLib.Mainloop.source_remove(this._refreshTimeoutId);

            this._refreshTimeoutId = GLib.Mainloop.timeout_add(100, () => {
                this._refreshTimeoutId = null;
                this._refresh();
                return GLib.Mainloop.SOURCE_REMOVE;
            });
        }

        // Populates the menu
        _refresh() {
            this.menu.removeAll();

            let active_vlans = new Map();
            let active_connections = this._client.get_active_connections() || [];
            active_connections.filter(ac => ac && ac.connection && ac.connection.is_type(NM.SETTING_VLAN_SETTING_NAME))
                .forEach(ac => active_vlans.set(ac.connection.get_uuid(), ac));

            let connections = this._client.get_connections() || [];
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
            let vlans = connections.filter(c => c.is_type(NM.SETTING_VLAN_SETTING_NAME))
                .sort((a, b) => collator.compare(a.get_id(), b.get_id()));

            if (vlans.length < 1) {
                this.menu.addMenuItem(new PopupMenu.PopupMenuItem(_("No VLAN found")));
            } else {
                vlans.forEach((vlan) => {
                    this._add_item(vlan, active_vlans.get(vlan.get_uuid()));
                });
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            let settingsItem = new PopupMenu.PopupMenuItem(_("Advanced Network Settings…"));
            settingsItem.connect('activate', () => {
                Util.spawn(['nm-connection-editor']);
                this.menu.close(); // Close the menu
            });
            this.menu.addMenuItem(settingsItem);
        }

        // Adds an item to the menu
        _add_item(vlan, active_vlan) {
            const state = active_vlan ? active_vlan.get_state() : null;

            const isActive = (state === NM.ActiveConnectionState.ACTIVATED ||
                              state === NM.ActiveConnectionState.ACTIVATING ||
                              state === NM.ActiveConnectionState.DEACTIVATING);
    
            const isSensitive = (state === null ||
                                 state === NM.ActiveConnectionState.ACTIVATED ||
                                 state === NM.ActiveConnectionState.DEACTIVATED);

            let switch_item = new PopupMenu.PopupSwitchMenuItem(vlan.get_id(), isActive);
            switch_item.setSensitive(isSensitive);
            switch_item.setStatus(this._get_status(active_vlan));
            this.menu.addMenuItem(switch_item);

            switch_item.connect('toggled', this._toggle.bind(this, vlan, active_vlan));
        }

        // Gets status label
        _get_status(active_vlan) {
            if (!active_vlan)
                return null;

            switch (active_vlan.get_state()) {
                case NM.ActiveConnectionState.DEACTIVATED:
                case NM.ActiveConnectionState.ACTIVATED:
                    return null;
                case NM.ActiveConnectionState.ACTIVATING:
                    return _("connecting…");
                case NM.ActiveConnectionState.DEACTIVATING:
                    return _("disconnecting…");
                default:
                    return null;
            }
        }

        // Toggles connection
        _toggle(vlan, active_vlan) {
            if (active_vlan) {
                this._client.deactivate_connection_async(active_vlan, null, (client, result) => {
                    try {
                        client.deactivate_connection_finish(result);
                    } catch (e) {
                        logError(e); // Simplified error logging
                        Main.notify(_("VLAN Deactivation Failed"), e.message);
                        this._queueRefresh();
                    }
                });
            } else {
                this._client.activate_connection_async(vlan, null, null, null, (client, result) => {
                    try {
                        client.activate_connection_finish(result);
                    } catch (e) {
                        logError(e); // Simplified error logging
                        Main.notify(_("VLAN Activation Failed"), e.message);
                        this._queueRefresh();
                    }
                });
            }
        }

        // Destroys the panel item
        destroy() {
            this._signalIds.forEach(id => this._client.disconnect(id));
            this._signalIds = [];

            if (this._refreshTimeoutId)
                GLib.Mainloop.source_remove(this._refreshTimeoutId);

            if (this.container) {
                this.container.destroy();
                this.container = null;
            }
        }
    }
);

// The main extension class
export default class VlanIndicatorExtension extends Extension {
    _vlanIndicator = null;

    constructor(metadata) {
        super(metadata);
        this.initTranslations();
    }

    enable() {
        this._vlanIndicator = new VlanManager();
    }

    disable() {
        if (this._vlanIndicator) {
            this._vlanIndicator.destroy();
            this._vlanIndicator = null;
        }
    }
}

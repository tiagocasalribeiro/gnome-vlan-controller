# GNOME VLAN Controller

### A GNOME extension to activate and deactivate VLAN connections from the top panel.

<p align="center">
    <img src="./vlan-controller.png" alt="VLAN Controller">
</p>

## Compatibility

This extension is compatible with GNOME Shell versions:
- **48** (Latest)

## Installation

### Manual Installation

#### From extensions.gnome.org

This can be installed from the GNOME extensions webpage:

https://extensions.gnome.org/extension/66131/vlan-controller/

#### From source code

```bash
cd ~/.local/share/gnome-shell/extensions/
rm -rf vlan-controller@tiagocasalribeiro.github.io
git clone https://github.com/tiagocasalribeiro/gnome-vlan-controller vlan-controller@tiagocasalribeiro.github.io
```

Now log out and log back in to reload the extensions.

## Usage

This will let you activate or deactivate existing VLAN connections, managed by the network manager. You first need to create the VLANs with your preferred tool, such as `nm-connection-editor`. The status of each connections is refreshed only when you open the popup menu.

## Troubleshooting

If you encounter issues:

 **GNOME Shell restart issues**: Log out and log back in as a fallback

## License

[GPLv3](http://www.gnu.org/licenses/gpl-3.0.en.html)

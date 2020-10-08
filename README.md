# changeMaker

is a Bitcoin (BSV) UTXO splitter. It loops trough your 'xpriv' and derives addresses from it.
It can be used to generate smaller UTXOs with different addresses, it tries to do this in a random fashion.
This is a way to get more privacy (not anonymity).

easiest way to get the xpriv from your seed words:
* import mnemonic into ElectrumSV
* get xpriv from ElectrumSV wallet file.

Edit the 'accounts.json' file with your settings and run the script.
 node changeMaker.js

You can then use [changeCaster](https://github.com/klar/changeCaster) to broadcast the signed transactions from an (unsecured) Computer / Server.

## issues
* sometimes too much api requests - rate limit from mattercloud.

## todo
* use ElectrumSV's rest api for getting UTXO information.
* Benfords Law?
 * https://nchain.com/benfords-wallet/

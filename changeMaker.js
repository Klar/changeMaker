const bsv = require('bsv');
const fetch = require("node-fetch");
const fs = require('fs');

// GLOBAL CONFIGURATION ON
const dust = 136
const MattercloudApi = ""

global.description
global.xprv
global.network
global.deriveReceivePath
global.deriveChangePath
global.maxSatoshis
global.minSatoshis
global.maxToAddresses
global.broadcast
global.filename
global.receiveIndex
global.changeIndex
global.generateEmptyAddresses
global.hdPrivateKeyMain
// GLOBAL CONFIGURATION OFF

async function getHistoryWoc(address) {
  let apiRequest = "https://api.whatsonchain.com/v1/bsv/"+network+"/address/"+address+"/history"
  let headers = {  }

  let response = await fetch(apiRequest, { method: 'GET', headers: headers });
  let json = await response.json();

  return json
}

async function getHistoryMtr(address){
  let apiRequest = "https://api.mattercloud.net/api/v3/"+network+"/address/"+address+"/history"
  let headers = {
    api_key: MattercloudApi
  }

  let response = await fetch(apiRequest, { method: 'GET', headers: headers });
  let json = await response.json();

  return json.results
}

async function getUtxoWoc(address){
  let apiRequest = "https://api.whatsonchain.com/v1/bsv/"+network+"/address/"+address+"/unspent"
  let headers = {  }

  let response = await fetch(apiRequest, { method: 'GET', headers: headers });
  let json = await response.json();

  let utxos = []
  json.forEach(async function(utxo){
    let apiRequest = "https://api.whatsonchain.com/v1/bsv/" + network + "/tx/hash/"+utxo.tx_hash

    let response = await fetch(apiRequest, { method: 'GET', headers: headers });
    let json = await response.json();

    let output = json.vout[utxo.tx_pos]

    utxos.push({
      "txId": utxo.tx_hash,
      "satoshis" : utxo.value,
      "outputIndex" : utxo.tx_pos,
      "address" : output.scriptPubKey.addresses[0],
      "script" : output.scriptPubKey.hex,
    })
  })

  return utxos
}

async function getUtxoMtr(address){
  let apiRequest = "https://api.mattercloud.net/api/v3/"+network+"/address/"+address+"/utxo"
  let headers = {
    api_key: MattercloudApi
  }

  let response = await fetch(apiRequest, { method: 'GET', headers: headers });
  let json = await response.json();

  for (let index in json){
    delete Object.assign(json[index], {txId: json[index].txid }).txid;
  }

  return json
}

async function broadcastWoc(txHex){
  let apiRequest = "https://api.whatsonchain.com/v1/bsv/"+network+"/tx/raw"

  let headers = {
  }

  let response = await fetch(apiRequest, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(
      {'txhex': txHex }
    )
  })

  let json = await response.json();

    json:

  return json
}

async function getPrivatekey(derivepath, index){
  let privateKey = hdPrivateKeyMain.deriveChild(derivepath + index)
  return privateKey
}

async function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

async function getRandomHistory(address){
  let randomInt = await getRandomInt(2)

  randomInt = 1
  console.log("  ///  remove 'randomInt = 1' !!! this is a fix because no other option for testnet  ///  ");

  if (randomInt == 1){
    console.log("calling whatsonchain")
    var history = await getHistoryWoc(address)
  } else {
    console.log("calling mattercloud")
    var history = await getHistoryMtr(address)
  }

  return history
}

async function getRandomUtxo(address){

  let randomInt = await getRandomInt(2)

  randomInt = 1
  console.log("  ///  remove 'randomInt = 1' !!! this is a fix because no other option for testnet  ///  ");

  if (randomInt == 1){
    console.log("calling whatsonchain")
    var utxos = await getUtxoWoc(address)
  } else {
    console.log("calling mattercloud")
    var utxos = await getUtxoMtr(address)
  }

  return utxos
}

async function getAddress(derivePath, startFromIndex, newKeys){
  let usedAddresses = []
  let emptyAddresses = []
  let gapCounter = 0

  for(index=startFromIndex;newKeys>=0;index++){
    let addressinfo = {}

    let privateKey = await getPrivatekey(derivePath, index)
    let address = bsv.Address.fromPublicKey(privateKey.publicKey)
    addressinfo["address"] = address

    // gap limit - if last 20 addresses were empty, we shouldnt need to fetch api
    if (gapCounter < 20){
      addressinfo["history"] = await getRandomHistory(address)
    } else{
      addressinfo["history"] = []
    }

    addressinfo["privateKey"] = privateKey

    if (addressinfo["history"].length == 0) {
      addressinfo["utxo"] = []  // no history - no utxo
      emptyAddresses.push(addressinfo)
      newKeys--
      gapCounter += 1
    } else {
      addressinfo["utxo"] = await getRandomUtxo(address)
      usedAddresses.push(addressinfo)
      gapCounter = 0
    }
    startFromIndex++
  }

  return [usedAddresses, emptyAddresses, startFromIndex]
}

async function createTransaction(from, to, changeAddr) {
  let addressForUtxo = []
  let newUtxos = []

  let tx = new bsv.Transaction()
  .from(from["utxo"])
    .change(changeAddr);

  for (const index in to) {
    tx.to(to[index]["address"], to[index]["satoshis"])
    addressForUtxo.push(to[index]["address"].toString())
  }

  tx.fee(tx.getFee());
  tx.sign([from["privateKey"].privateKey]);

  // fix error: Unspent value is different from specified fee: Unspent value is 377 but specified fee is 181
  let satoshisSpend = 0
  for (let index in tx.outputs){
    satoshisSpend += tx.outputs[index]._satoshis
  }

  let difference = tx._inputAmount - satoshisSpend - tx._fee
  let newChangeSatoshis = tx.outputs[tx.outputs.length - 1]._satoshis + difference
  delete tx.outputs[tx.outputs.length - 1]  //remove change address with wrong fee

  tx.to(changeAddr, newChangeSatoshis)

  tx.sign([from["privateKey"].privateKey]);
  let txid = tx.toObject().hash

  addressForUtxo.push(changeAddr)

  for (let index in tx.outputs){
    // because we don't have the address.toString()
    // it's possible to have removed the only "to" and only have the "change" in the tx.output
    let addressIndex = addressForUtxo.findIndex(address => bsv.Script.buildPublicKeyHashOut(address).toHex() === tx.outputs[index]._script.toHex())

    newUtxos.push({
      "address": addressForUtxo[addressIndex],
      "satoshis": tx.outputs[index]._satoshis,
      "script": tx.outputs[index]._script.toHex(),
      "outputIndex": parseInt(index),
      "txid": txid
    })
  }

  return [tx.serialize(), newUtxos]
}

async function filterFromAddresses(from, maxSatoshis){

  // filter out smaller than maxSatoshis
  for (let index in from) {
    let utxoSatoshis = 0

    // satoshis ==> all utxos together
    for (let utxoIndex in from[index].utxo) {
      utxoSatoshis += from[index].utxo[utxoIndex].satoshis
    }

    // clear utxo:
    // utxos smaller than maxSatoshis
    // if not enough satoshis for two outputs (to + change) (we don't want txs with one output)
    if (utxoSatoshis <= maxSatoshis || (utxoSatoshis / 2 ) <= minSatoshis ) {
      from[index].utxo = []
    }
  }

  // filter out empty utxo
  from = from.filter(function(address) {
    return (address.utxo.length > 0)
  })

  return from
}

async function transactionBuilder(){
  if (broadcast == false){
    fs.writeFile(filename, "", function (err) {
      if (err) throw err;
      console.log('File created.');
    });

    var logger = fs.createWriteStream(filename, {
      flags: 'a' // 'a' means append
    })
  }

  // get all info from Receive path derived
  var allReceive = await getAddress(deriveReceivePath, receiveIndex, generateEmptyAddresses)
  var receiveFrom = allReceive[0]
  var receiveTo = allReceive[1]
  receiveIndex = allReceive[2]

  // get all info from change path derived
  var allChange = await getAddress(deriveChangePath, changeIndex , 0)
  var changeFrom = allChange[0]
  // var changeTo = allChange[1]
  // changeIndex = allChange[2]

  var from = receiveFrom.concat(changeFrom)
  var receive = receiveTo

  while (from.length > 0) {
    // filter out unneeded from addresses - utxos
    from = await filterFromAddresses(from, maxSatoshis)

    if (from.length == 0){
      break
    }

    // generate new receive addresses if needed
    // +1 is for change addr
    if (maxToAddresses +1 > receive.length){
      receiving = await getAddress(deriveReceivePath, receiveIndex, generateEmptyAddresses * 10)
      receiveTo = receiving[1]
      receiveIndex = receiving[2]
      receive = receive.concat(receiveTo)
    }

    // transaction "from" utxo
    var randomTransactionFromIndex = Math.floor(Math.random() * from.length)
    var transactionFrom = from[randomTransactionFromIndex]

    var fromSatoshis = 0
    for (let utxoIndex in transactionFrom.utxo) {
      fromSatoshis += transactionFrom.utxo[utxoIndex].satoshis
    }

    // "Dust amount detected in one output" - if tx.output.change minus the fee is less than dust
    // lets keep a bit of difference (dust) for the change satoshi output
    // could or should be higher if minSatoshis is really small and tx uses lots of fee
    fromSatoshis -= dust

    // "change" address
    var changeAddr = receive[0].address.toString()
    from.push(receive[0])
    receive.shift()

    // "to" address
    var to = []
    var randomToCount = Math.floor((Math.random() * maxToAddresses) + 1)

    for (i = 0; i < randomToCount ;i++) {
      let sendTo = {}
      let randomSatoshis = Math.floor(Math.random() * (Math.floor(maxSatoshis) - minSatoshis) + minSatoshis)

      if (fromSatoshis < randomSatoshis || receive.length < randomToCount || fromSatoshis - randomSatoshis <= minSatoshis ){
        // if not enough satoshis for next "to" / "change" address - break out of loop
        break
      }

      sendTo["address"] = receive[0]["address"]
      sendTo["satoshis"] = randomSatoshis
      to.push(sendTo)
      from.push(receive[0])
      receive.shift()

      fromSatoshis -= randomSatoshis
    }


    var txData = await createTransaction(transactionFrom, to, changeAddr)
    var serialData = txData[0];
    console.log(serialData);

    if (broadcast){
      // direct broadcast
      var txid = await broadcastWoc(serialData)
      console.log("broadcasted: " + txid);
    } else{
      // append to file
      fs.appendFile(filename,serialData + "\n",function(err){
        if(err){
          console.error(err);
        }
      })
    }

    from[randomTransactionFromIndex].utxo = [] //empty the "from" utxo

    var newUtxos = txData[1]

    for (const utxoIndex in newUtxos) {
      let newUtxo = newUtxos[utxoIndex]
      let newUtxoAddress = newUtxo.address

      let addressIndex = from.findIndex(fromAddress => fromAddress.address.toString() === newUtxoAddress)

      from[addressIndex].utxo.push(newUtxo)
    }
  }
  console.log("We're done, all UTXOs split");

  if (broadcast == false){
    logger.end()
  }
}

async function main(){
  var account_config = fs.readFileSync('accounts.json');
  var accounts = JSON.parse(account_config);

  for(var i = 0; i < accounts.length; i++) {
    let account = accounts[i];

    if (account.enabled){


      description = account.description
      console.log(description + ": ");
      xprv = account.xprv
      network = account.network
      deriveReceivePath = account.deriveReceivePath
      deriveChangePath = account.deriveChangePath
      maxSatoshis = account.maxSatoshis
      minSatoshis = account.minSatoshis
      maxToAddresses = account.maxToAddresses
      broadcast = account.broadcast
      filename = account.filename
      receiveIndex = account.receiveIndex
      changeIndex = account.changeIndex
      generateEmptyAddresses = maxToAddresses * 20
      bsv.Transaction.FEE_PER_KB = accounts[0].fee_per_kb

      if (network == "main"){
        bsv.Networks.defaultNetwork = bsv.Networks.livenet
      } else if (network == "stn"){
        bsv.Networks.defaultNetwork = bsv.Networks.stn
      } else {
        bsv.Networks.defaultNetwork = bsv.Networks.testnet
      }

      // master seed key
      hdPrivateKeyMain = bsv.HDPrivateKey.fromString(xprv)

      await transactionBuilder()
    }
  }
}

main()

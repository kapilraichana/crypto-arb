if (typeof WebSocket !== 'function') {
    // for node.js install ws package
    WebSocket = require('ws');
}

const logger = {
    debug: (...arg) => {
        // console.log((new Date).toISOString(), 'DEBUG', ...arg)
    },
    info: (...arg) => {
        console.log((new Date).toISOString(), 'INFO', ...arg)
		//document.getElementById('content_log1').innerHTML = (new Date).toISOString(), 'INFO', ...arg;
		content_log1 = document.getElementById('content_log1');
		htmldata = ((new Date).toISOString()+ ' INFO ' + arg);
		var newinfo = document.createElement('div');
		newinfo.innerHTML = htmldata;
		content_log1.insertBefore(newinfo, content_log1.firstChild || null);
    },
    warn: (...arg) => {
        console.log((new Date).toISOString(), 'WARN', ...arg)
    }
};

class SocketClient {

    constructor(onConnected) {
        this._id = 1;
        this._createSocket();
        this._onConnected = onConnected;
        this._promises = new Map();
        this._handles = new Map();
    }

    _createSocket() {
        this._ws = new WebSocket('wss://api.hitbtc.com/api/2/ws');
        //this._ws = new WebSocket('wss://demo-api.hitbtc.com:8080');
        //this._ws = new WebSocket('wss://api.hitbtc.com:8080');
       
        this._ws.onopen = () => {
            logger.info('ws connected');
            this._onConnected();
        };
        this._ws.onclose = () => {
            logger.warn('ws closed');
            this._promises.forEach((cb, id) => {
                this._promises.delete(id);
                cb.reject(new Error('Disconnected'));
            });
            setTimeout(() => this._createSocket(), 500);
        };
        this._ws.onerror = err => {
            logger.warn('ws error', err);
        };
        this._ws.onmessage = msg => {
            logger.debug('<', msg.data);
            try {
                const message = JSON.parse(msg.data);
                if (message.id) {
                    if (this._promises.has(message.id)) {
                        const cb = this._promises.get(message.id);
                        this._promises.delete(message.id);
                        if (message.result) {
                            cb.resolve(message.result);
                        } else if (message.error) {
                            cb.reject(message.error);
                        } else {
                            logger.warn('Unprocessed response', message)
                        }
                    }
                } else if (message.method && message.params) {
                    if (this._handles.has(message.method)) {
                        this._handles.get(message.method).forEach(cb => {
                            cb(message.params);
                        });
                    } else {
                        logger.warn('Unprocessed method', message);
                    }
                } else {
                    logger.warn('Unprocessed message', message);
                }
            } catch (e) {
                logger.warn('Fail parse message', e);
            }
        }
    }

    request(method, params = {}) {
        if (this._ws.readyState === WebSocket.OPEN) {
            return new Promise((resolve, reject) => {
                const requestId = ++this._id;
                this._promises.set(requestId, {resolve, reject});
                const msg = JSON.stringify({method, params, id: requestId});
                logger.debug('>', msg);
                this._ws.send(msg);
                setTimeout(() => {
                    if (this._promises.has(requestId)) {
                        this._promises.delete(requestId);
                        reject(new Error('Timeout'));
                    }
                }, 10000);
            });
        } else {
            return Promise.reject(new Error('WebSocket connection not established'))
        }
    }

    setHandler(method, callback) {
        if (!this._handles.has(method)) {
            this._handles.set(method, []);
        }
        this._handles.get(method).push(callback);
    }
}

function updateIndex(sortedArray, item, index) {
    if (index < sortedArray.length && sortedArray[index].price === item.price) {
        if (item.size === 0) {
            sortedArray.splice(index, 1);
        } else {
            sortedArray[index].size = item.size;
        }
    } else if (item.size !== 0) {
        sortedArray.splice(index, 0, item);
    }
    return index === 0;
}

function getSortedIndex(array, value, inverse) {
    inverse = Boolean(inverse);
    let low = 0, high = array ? array.length : low;
    while (low < high) {
        let mid = (low + high) >>> 1;
        if ((!inverse && (+array[mid].price < +value)) || (inverse && (+array[mid].price > +value))) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    return low;
}

class OrderBookStore {

    constructor(onChangeBest) {
        this._data = {};
        this._onChangeBest = onChangeBest;
    }

    getOrderBook(symbol) {
        return this._data[symbol.toString()];
    }

    snapshotOrderBook(symbol, ask, bid) {
		console.log('snapshot of OrderBook');
        this._data[symbol.toString()] = {
            ask: ask,
            bid: bid
        };
		//console.log(this._data['BTCUSD']);
		const dataTable = $('#realtime').DataTable({
		  data: this._data['BTCUSD'].bid,
		  order: [[0, 'desc']],
		  searching: false,
		  paging: true,
		  columns: [
			/*{ title: 'Ask Price' , data: "ask.price"},
			{ title: 'Ask Size' , data: "ask"},*/
			{ title: 'Bid Price' , data: "price"},
			{ title: 'Bid Size' , data: "size"}
		  ],
		  destroy:true
		});
    }

    updateOrderBook(symbol, ask, bid, timestamp) {
		/*
		Want to handle the updateOrderbook method, but don't display any updates
		* /
        const data = this._data[symbol.toString()];
        if (data) {
            let bestChanged = false;
            ask.forEach(function (v) {
                bestChanged |= updateIndex(data.ask, v, getSortedIndex(data.ask, v.price));
            });
            bid.forEach(function (v) {
                bestChanged |= updateIndex(data.bid, v, getSortedIndex(data.bid, v.price, true));
            });
            if (bestChanged && this._onChangeBest) {
                this._onChangeBest(symbol, data.ask.length > 0 ? data.ask[0].price : null, data.bid.length > 0 ? data.bid[0].price : null, timestamp);
            }
        }
		/**/
    }
}

function generateRandom() {
    let d = Date.now();
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

logger.info('Start application');
const orderBooks = new OrderBookStore((symbol, bestASk, bestBid, timestamp) => {
    logger.info('New best orderbook', symbol, bestASk, bestBid, timestamp);
});
const socketApi = new SocketClient(async () => {
    try {
        const symbols = await socketApi.request('getSymbols');
        const subscribeSymbols = symbols.filter(s => s.baseCurrency === 'BTC' && (s.quoteCurrency === 'USD' || s.quoteCurrency === 'TUSD'));

        for (let s of subscribeSymbols) {
            logger.info('Subscribe to orderbook', s.id);
            await socketApi.request('subscribeOrderbook', {symbol: s.id});
        }
        // try to auth place your keys
        await socketApi.request('login', {"algo": "BASIC",
            "pKey": "07e61275b247594afc73f68a0af72221",
            "sKey": "c8158a7556afe8026002ebae766dcfff"});
        const balance  = await socketApi.request('getTradingBalance');
        logger.info('balance',balance.filter(b => b.available !== '0' || b.reserved !== '0'));
        // place order
        await socketApi.request('subscribeReports');
        /*await socketApi.request('newOrder', {clientOrderId: generateRandom(), symbol: 'BTCUSD', side: 'sell', price: '17777.00', quantity: '0.01'});*/

    } catch (e) {
        logger.warn(e);
    }
});
socketApi.setHandler('snapshotOrderbook', params => {
    orderBooks.snapshotOrderBook(params.symbol, params.ask, params.bid);
});

socketApi.setHandler('updateOrderbook', params => {
    orderBooks.updateOrderBook(params.symbol, params.ask, params.bid, params.timestamp);
});
/**/
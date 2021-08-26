const process = require('process');
const { createHash } = require('crypto');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: parseInt(process.env.PORT) });
const sqlite3 = require('sqlite3');
let baseDatos = new sqlite3.Database('atds3_ppf.db');
let temporizadorInvalidacionFichas;


function iniciarBaseDatos() {
	baseDatos.exec("CREATE TABLE IF NOT EXISTS fichas (id INTEGER PRIMARY KEY AUTOINCREMENT, ficha TEXT NOT NULL, expiracion INTEGER NOT NULL)", () => {});
	baseDatos.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_fichas_ficha ON fichas (ficha)", () => {});
	
	temporizadorInvalidacionFichas = setInterval(eventoInvalidacacionFichas, 60000);
}

function validarLlaveAcceso(llave) {
	return true;
}

function comandoAportarFicha(mensaje) {
	baseDatos.exec(`INSERT INTO fichas (ficha, expiracion) VALUES ('${mensaje.ficha}', ${mensaje.expiracion})`, () => {});
	console.info(`Ficha aportada: ${mensaje.ficha}`);
}

function comandoSolicitarFicha(socalo) {
	baseDatos.get("SELECT ficha FROM fichas ORDER BY random() LIMIT 1", (_error, fila) => {
		socalo.send(JSON.stringify({ accion: "entregarFicha", ficha: fila.ficha}));
		console.info(`Ficha entregada: ${fila.ficha}`);
	});
}

function eventoInvalidacacionFichas() {
	baseDatos.exec("DELETE FROM fichas WHERE (datetime('now') >= datetime(expiracion,'unixepoch'))", () => {});
	baseDatos.exec("VACUUM", () => {});
}

function eventoConexion(socalo) {
	socalo.estaVivo = true;

	socalo.on("message", function eventoMensaje(datos) {
		try {
			const mensaje = JSON.parse(datos);
			
			if (mensaje["acceso"] !== undefined) {
				if (validarLlaveAcceso(mensaje.acceso) === true) {
					if (mensaje.accion === 'aportarFicha') {
						comandoAportarFicha(mensaje);
					}
					if (mensaje.accion === 'solicitarFicha') {
						comandoSolicitarFicha(socalo);
					}
				}
			}
		} catch (e) {
			console.info(e)
		}
	});
	
	socalo.on("ping", function ping() {
		socalo.estaVivo = true;
	});
	
	socalo.on("close", function cerrar() {
		clearInterval(socalo.temporizadorVerificarConexion);
	})
	
	socalo.temporizadorVerificarConexion = setInterval(function verificarConexion() {
		if (socalo.estaVivo === false) {
			return socalo.terminate();
		} else {
			socalo.estaVivo = false;
		}
	}, 20000);
}


iniciarBaseDatos();

wss.on("connection", eventoConexion);

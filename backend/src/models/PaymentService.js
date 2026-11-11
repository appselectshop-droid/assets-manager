const mongoose = require('mongoose');
const { FREQUENCIES } = require('../utils/paymentSchedule');

// Catálogo de Pagos Recurrentes (2026-11-11, pedido explícito del usuario) —
// cada renglón de las hojas "Mensual"/"Anual" de su Excel
// PagosIT_2_corregido_recibos_pagos_v2.xlsx: un servicio que se paga cada
// cierto tiempo (Telmex por línea, Total Play por cuenta, renta de
// impresoras por contrato, dominios, licencias...). Los campos de captura
// (compañía, sucursal, centro de costos, dirección, motivo) se guardan tal
// cual los escribe el usuario, igual que en Cuentas por Pagar — son los
// mismos datos que vuelve a capturar ahí al meter la solicitud.
//
// Cada vencimiento concreto vive en PaymentCycle (uno por periodo).
const paymentServiceSchema = new mongoose.Schema({
  proveedor:     { type: String, required: true, trim: true },
  cuenta:        { type: String, default: '', trim: true }, // TEL / CUENTA / CONTRATO / dominio
  motivo:        { type: String, default: '', trim: true },
  centroCostos:  { type: String, default: '', trim: true },
  compania:      { type: String, default: '', trim: true },
  sucursal:      { type: String, default: '', trim: true },
  direccion:     { type: String, default: '', trim: true },
  montoEstimado: { type: Number, default: null },
  moneda:        { type: String, enum: ['MXN', 'USD', 'EUR'], default: 'MXN' },

  frecuencia:     { type: String, enum: Object.keys(FREQUENCIES), default: 'mensual' },
  diaVencimiento: { type: Number, required: true, min: 1, max: 31 },
  // Mes ancla (1-12) para todo lo que no es mensual — ej. anual en marzo.
  mesVencimiento: { type: Number, min: 1, max: 12, default: null },

  // Solo se generan ciclos con fecha límite >= esta fecha ("YYYY-MM-DD") —
  // para no llenar el tablero de "atrasados" con periodos viejos que ya se
  // pagaron antes de que existiera este módulo.
  ciclosDesde: { type: String, required: true },

  activo: { type: Boolean, default: true },

  // Aprendidos de las facturas verificadas (✅) de este pago — ver
  // utils/invoiceCheck.js. Total Play factura con 2 RFC (Total Play y
  // Total Box), por eso el emisor es lista.
  rfcsEmisor:  [{ type: String }],
  rfcReceptor: { type: String, default: '' },
  notas:  { type: String, default: '' },
  origen: { type: String, default: '' }, // ej. "Excel: Mensual fila 12"

  createdBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PaymentService', paymentServiceSchema);

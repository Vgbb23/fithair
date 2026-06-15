/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  ShoppingBag, 
  Menu, 
  Search,
  Star, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Truck, 
  ShieldCheck, 
  ArrowRight,
  Droplets,
  Sparkles,
  Zap,
  Moon,
  Sun,
  Flame,
  Instagram,
  Facebook,
  Mail,
  Copy,
  Check,
  QrCode,
  MapPin,
  User,
  Phone,
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractPixFromFruitfyPayload, pickOrderUuidForApi } from "./pixExtract";
import { parseResponseJson } from "./parseResponseJson";
import { mergeUrlParamsFromLocation, toFruitfyUtmPayload } from "./urlParams";
import {
  KIT_CATALOG,
  formatBRL,
  listPriceBRLFromKit,
} from "../../api/lib/kitPrices";
import fitHairProductImg from "./assets/fit-hair-product.png";

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const centsFromBRL = (value: number) => Math.round(value * 100);

const formatCep = (digits: string) => {
  const d = digits.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const formatCpf = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Valida CPF brasileiro (11 dígitos + dígitos verificadores). */
const isValidCpf = (digits: string): boolean => {
  const d = onlyDigits(digits);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10]!, 10);
};

const formatPhoneBr = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return `(${ddd}) `;
  if (d.length <= 6) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
};

const BrandLogo = () => (
  <img
    src="https://i.ibb.co/1G4gWh3d/logo-alwaysfit-1200x628-1.webp"
    alt="AlwaysFit Fit Hair"
    className="h-7 sm:h-10 w-auto object-contain"
    referrerPolicy="no-referrer"
  />
);

const inputMaskedClass =
  "w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] focus:ring-2 focus:ring-[#A73552]/15 transition-all text-sm tabular-nums tracking-wide text-[#24181C] placeholder:text-[#B98494]";

const inputMaskedErrorClass =
  "w-full px-4 py-3 rounded-xl border border-red-400 bg-[#FFF6F8] focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all text-sm tabular-nums tracking-wide text-[#24181C] placeholder:text-[#B98494]";

interface OrderBump {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

const ORDER_BUMPS: OrderBump[] = [];

// --- Checkout Components ---

const CheckoutHeader = () => (
  <header className="bg-white py-4 border-b border-[#F8D5DC] sticky top-0 z-50">
    <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
      <BrandLogo />
      <div className="flex items-center gap-2 text-[#24181C] font-bold text-sm uppercase tracking-wider">
        <ShieldCheck size={18} className="text-[#A73552]" />
        Checkout Seguro
      </div>
    </div>
  </header>
);

const Checkout = ({ kit, onBack, onFinish }: { kit: any, onBack: () => void, onFinish: (data: any) => Promise<void> }) => {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState<'free' | 'sedex'>('free');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [customer, setCustomer] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedOrderBumps, setSelectedOrderBumps] = useState<string[]>([]);
  const orderBumps: OrderBump[] = [
    ...ORDER_BUMPS,
    {
      id: "bump-produto-principal-extra",
      name: "1 Pote Extra com Desconto",
      description: "Mantenha a constância: garanta uma unidade extra agora e siga o protocolo diário de cápsulas para cabelo, pele e unhas.",
      price: 27.9,
      image: kit.image,
    },
  ];

  const handleCepChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    const formatted = formatCep(digits);
    setAddress((prev) => ({ ...prev, cep: formatted }));

    if (digits.length < 8) {
      setCepError(null);
      return;
    }

    setCepLoading(true);
    setCepError(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) {
        setCepError("CEP não encontrado. Verifique os números.");
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: "",
          neighborhood: "",
          city: "",
          state: "",
        }));
      } else {
        setCepError(null);
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: data.logradouro ?? "",
          neighborhood: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP", error);
      setCepError("Não foi possível validar o CEP. Tente de novo.");
    } finally {
      setCepLoading(false);
    }
  };

  const cepDigits = onlyDigits(address.cep);
  const cpfDigits = onlyDigits(customer.cpf);
  const cpfInvalid = cpfDigits.length === 11 && !isValidCpf(cpfDigits);

  const subtotal = kit.price * quantity;
  const shippingPrice = shipping === 'sedex' ? 14.37 : 0;
  const orderBumpsTotal = orderBumps
    .filter((bump) => selectedOrderBumps.includes(bump.id))
    .reduce((sum, bump) => sum + bump.price, 0);
  const total = subtotal + shippingPrice + orderBumpsTotal;
  
  const toggleOrderBump = (id: string) => {
    setSelectedOrderBumps((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  
  const handleSubmitOrder = async () => {
    setSubmitError(null);
    const requiredFieldsFilled =
      customer.name.trim() &&
      customer.email.trim() &&
      customer.cpf.trim() &&
      customer.phone.trim();

    if (!requiredFieldsFilled) {
      setSubmitError("Preencha nome, e-mail, CPF e telefone para continuar.");
      return;
    }

    if (cpfDigits.length !== 11) {
      setSubmitError("Informe o CPF completo (11 dígitos).");
      return;
    }
    if (!isValidCpf(customer.cpf)) {
      setSubmitError("O CPF informado é inválido.");
      return;
    }

    if (cepDigits.length !== 8) {
      setSubmitError("Informe o CEP completo (8 dígitos).");
      return;
    }
    if (cepError) {
      setSubmitError("Corrija o CEP antes de finalizar o pedido.");
      return;
    }

    setSubmitting(true);
    try {
      await onFinish({ total, customer, address, shipping, quantity, orderBumpsTotal });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível gerar o PIX.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF6F8] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[#7B5360] text-sm mb-8 hover:text-[#A73552] transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar para a loja
        </button>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Dados Pessoais */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F8D5DC] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F8D5DC] pb-4">
                <div className="w-10 h-10 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[#A73552]">
                  <User size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#24181C]">Dados Pessoais</h2>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Nome Completo</label>
                  <input 
                    type="text" 
                    placeholder="Seu nome completo"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={customer.name}
                    onChange={e => setCustomer({...customer, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">E-mail</label>
                  <input 
                    type="email" 
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={customer.email}
                    onChange={e => setCustomer({...customer, email: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">CPF</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfInvalid ? inputMaskedErrorClass : inputMaskedClass}
                    value={customer.cpf}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        cpf: formatCpf(onlyDigits(e.target.value)),
                      })
                    }
                  />
                  {cpfInvalid && (
                    <p className="text-xs text-red-600 font-medium">CPF inválido. Confira os números.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Celular / WhatsApp</label>
                  <input 
                    type="tel" 
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className={inputMaskedClass}
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        phone: formatPhoneBr(onlyDigits(e.target.value)),
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Entrega */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F8D5DC] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F8D5DC] pb-4">
                <div className="w-10 h-10 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[#A73552]">
                  <MapPin size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#24181C]">Dados de Entrega</h2>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">CEP</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className={cepError ? inputMaskedErrorClass : inputMaskedClass}
                      value={address.cep}
                      onChange={handleCepChange}
                    />
                    {cepLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#A73552] border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                  {cepError && (
                    <p className="text-xs text-red-600 font-medium">{cepError}</p>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Endereço</label>
                  <input 
                    type="text" 
                    placeholder="Rua, Avenida..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.street}
                    onChange={e => setAddress({...address, street: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Número</label>
                  <input 
                    type="text" 
                    placeholder="123"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.number}
                    onChange={e => setAddress({...address, number: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Complemento</label>
                  <input 
                    type="text" 
                    placeholder="Apto, Bloco..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.complement}
                    onChange={e => setAddress({...address, complement: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Bairro</label>
                  <input 
                    type="text" 
                    placeholder="Bairro"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.neighborhood}
                    onChange={e => setAddress({...address, neighborhood: e.target.value})}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Cidade</label>
                  <input 
                    type="text" 
                    placeholder="Cidade"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.city}
                    onChange={e => setAddress({...address, city: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Estado</label>
                  <input 
                    type="text" 
                    placeholder="UF"
                    className="w-full px-4 py-3 rounded-xl border border-[#F8D5DC] bg-[#FFF6F8] focus:outline-none focus:border-[#A73552] transition-colors text-sm"
                    value={address.state}
                    onChange={e => setAddress({...address, state: e.target.value})}
                  />
                </div>
              </div>

              {cepDigits.length === 8 && !cepLoading && !cepError && (
                <div className="space-y-4 pt-4 border-t border-[#F8D5DC]">
                  <label className="text-xs font-bold text-[#24181C] uppercase tracking-wider">Escolha o Frete</label>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => setShipping('free')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'free' ? 'border-[#A73552] bg-[#F8D5DC]' : 'border-[#F8D5DC] hover:border-[#E8B8C3]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'free' ? 'border-[#A73552]' : 'border-[#7B5360]'}`}>
                          {shipping === 'free' && <div className="w-2.5 h-2.5 bg-[#A73552] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#24181C] text-sm">Frete Grátis</p>
                          <p className="text-xs text-[#7B5360]">7 a 10 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#A73552] text-sm">Grátis</span>
                    </button>
                    <button 
                      onClick={() => setShipping('sedex')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'sedex' ? 'border-[#A73552] bg-[#F8D5DC]' : 'border-[#F8D5DC] hover:border-[#E8B8C3]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'sedex' ? 'border-[#A73552]' : 'border-[#7B5360]'}`}>
                          {shipping === 'sedex' && <div className="w-2.5 h-2.5 bg-[#A73552] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#24181C] text-sm">SEDEX Express</p>
                          <p className="text-xs text-[#7B5360]">2 a 3 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#24181C] text-sm">R$ 14,37</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Pagamento */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F8D5DC] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F8D5DC] pb-4">
                <div className="w-10 h-10 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[#A73552]">
                  <Zap size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#24181C]">Pagamento</h2>
              </div>
              
              <div className="p-4 rounded-2xl border-2 border-[#A73552] bg-[#F8D5DC] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#A73552] shadow-sm">
                    <Zap size={20} fill="currentColor" />
                  </div>
                  <div>
                    <p className="font-bold text-[#24181C] text-sm">PIX</p>
                    <p className="text-xs text-[#7B5360]">Aprovação imediata</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#7B5360] text-center italic">
                O código PIX será gerado após a finalização do pedido.
              </p>
              <div className="space-y-3">
                {orderBumps.map((bump) => {
                  const isSelected = selectedOrderBumps.includes(bump.id);
                  return (
                    <button
                      key={bump.id}
                      type="button"
                      onClick={() => toggleOrderBump(bump.id)}
                      className={`w-full text-left rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? "border-[#A73552] bg-[#F8D5DC]"
                          : "border-[#F8D5DC] bg-white hover:border-[#E8B8C3]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={bump.image}
                            alt={bump.name}
                            className="w-14 h-14 rounded-xl object-cover border border-[#F8D5DC]"
                          />
                          <div>
                            <p className="text-sm font-bold text-[#24181C]">{bump.name}</p>
                            <p className="text-xs text-[#7B5360] mt-1">{bump.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#A73552] whitespace-nowrap">
                          + R$ {bump.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Summary Section */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <section className="bg-white p-6 rounded-3xl border border-[#F8D5DC] shadow-lg space-y-6">
              <h2 className="text-lg font-bold text-[#24181C] border-b border-[#F8D5DC] pb-4">Resumo do Pedido</h2>
              
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-[#F8D5DC] rounded-xl overflow-hidden flex-shrink-0 border border-[#F8D5DC]">
                  <img src={kit.image} alt={kit.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-[#24181C] text-sm leading-tight">{kit.name} Fit Hair</h3>
                  <p className="text-xs text-[#7B5360]">Suplemento em cápsulas</p>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center border border-[#F8D5DC] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-2 py-1 hover:bg-[#F8D5DC] text-[#A73552] transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-[#24181C] border-x border-[#F8D5DC] min-w-[32px] text-center">
                        {quantity}
                      </span>
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-2 py-1 hover:bg-[#F8D5DC] text-[#A73552] transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-[#24181C] text-sm">R$ {subtotal.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#F8D5DC]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#7B5360]">Subtotal</span>
                  <span className="text-[#24181C] font-medium">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#7B5360]">Frete</span>
                  <span className="text-[#A73552] font-bold">{shippingPrice > 0 ? `R$ ${shippingPrice.toFixed(2).replace('.', ',')}` : 'GRÁTIS'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#7B5360]">Adicionais</span>
                  <span className="text-[#24181C] font-medium">R$ {orderBumpsTotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-[#F8D5DC]">
                  <span className="font-bold text-[#24181C]">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#24181C]">R$ {total.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full py-4 bg-[#A73552] text-white rounded-full font-bold hover:bg-[#8F2C45] transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2 group"
              >
                {submitting ? "GERANDO PIX..." : "FINALIZAR PEDIDO"}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              {submitError && (
                <p className="text-xs text-red-500 text-center">{submitError}</p>
              )}

              <div className="flex items-center justify-center gap-2 pt-4">
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#24181C]">
                  <ShieldCheck size={12} className="text-[#A73552]" />
                  COMPRA SEGURA
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

const POST_PIX_PAID_REDIRECT_DEFAULT = "https://rastreiogummy.netlify.app/";
const POST_PIX_POLL_MS = 200;

const PixSuccess = ({ orderData, onReset }: { orderData: any, onReset: () => void }) => {
  const [copied, setCopied] = useState(false);
  const pixCode = orderData.pixCode;
  const qrCodeImage = orderData.qrCodeImage;
  const orderUuid =
    (typeof orderData.orderId === "string" && orderData.orderId) ||
    pickOrderUuidForApi(orderData.gatewayPayload);

  useEffect(() => {
    const redirectUrl =
      (import.meta.env.VITE_PIX_PAID_REDIRECT_URL as string | undefined)?.trim() ||
      POST_PIX_PAID_REDIRECT_DEFAULT;
    if (!orderUuid) return;

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();
    const maxMs = 2 * 60 * 60 * 1000;
    const terminalFail = new Set([
      "canceled",
      "cancelled",
      "refused",
      "failed",
      "refunded",
      "chargeback",
    ]);

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - started > maxMs) {
        stop();
        return;
      }
      inFlight = true;
      try {
        const r = await fetch(`/api/order/${encodeURIComponent(orderUuid)}`);
        const j = (await parseResponseJson(r)) as {
          data?: { status?: string };
        };
        if (cancelled) return;
        const status = typeof j?.data?.status === "string" ? j.data.status : "";
        if (status === "paid") {
          stop();
          window.location.replace(redirectUrl);
          return;
        }
        if (terminalFail.has(status)) stop();
      } catch {
        /* próximo ciclo */
      } finally {
        inFlight = false;
      }
    };

    intervalId = setInterval(tick, POST_PIX_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      stop();
    };
  }, [orderUuid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FFF6F8] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-2xl mx-auto px-4 py-12 text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[#A73552] mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#24181C]">Pedido Realizado com Sucesso!</h1>
          <p className="text-[#7B5360] max-w-md mx-auto">
            Falta pouco! Realize o pagamento via PIX para que possamos enviar seu Fit Hair o quanto antes.
          </p>
          {orderUuid ? (
            <p className="text-xs text-[#A73552] font-medium max-w-md mx-auto">
              Aguardando confirmação do pagamento… você será redirecionado assim que o PIX for aprovado.
            </p>
          ) : (
            <p className="text-xs text-amber-700/90 max-w-md mx-auto">
              Não foi possível identificar o pedido para acompanhamento automático. Após pagar, guarde o comprovante.
            </p>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#F8D5DC] shadow-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#7B5360] uppercase tracking-widest">Valor a pagar</p>
            <p className="text-4xl font-black text-[#24181C]">R$ {orderData.total.toFixed(2).replace('.', ',')}</p>
          </div>

          <div className="bg-[#F8D5DC] p-6 rounded-2xl inline-block border-2 border-[#E8B8C3]">
            {qrCodeImage ? (
              <img
                src={qrCodeImage.startsWith("data:") ? qrCodeImage : `data:image/png;base64,${qrCodeImage}`}
                alt="QR Code PIX"
                className="w-[180px] h-[180px] object-contain"
              />
            ) : (
              <QrCode size={180} className="text-[#24181C]" />
            )}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold text-[#24181C]">Código PIX Copia e Cola</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                readOnly 
                value={pixCode}
                className="flex-1 bg-[#FFF6F8] border border-[#F8D5DC] rounded-xl px-4 py-3 text-xs text-[#7B5360] truncate"
              />
              <button 
                onClick={handleCopy}
                className="w-full sm:w-auto bg-[#A73552] text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#8F2C45] transition-all"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 text-left max-w-md mx-auto">
          <h3 className="font-bold text-[#24181C] flex items-center gap-2">
            <Clock size={18} className="text-[#A73552]" />
            Como pagar?
          </h3>
          <ol className="space-y-3 text-sm text-[#7B5360]">
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[10px] font-bold text-[#A73552] flex-shrink-0">1</span>
              Abra o app do seu banco e escolha a opção PIX.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[10px] font-bold text-[#A73552] flex-shrink-0">2</span>
              Escaneie o QR Code ou cole o código acima.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F8D5DC] rounded-full flex items-center justify-center text-[10px] font-bold text-[#A73552] flex-shrink-0">3</span>
              Confirme os dados e finalize o pagamento.
            </li>
          </ol>
        </div>

        <button 
          onClick={onReset}
          className="text-[#7B5360] text-sm font-medium hover:text-[#A73552] transition-colors pt-8"
        >
          Voltar para a página inicial
        </button>
      </main>
    </div>
  );
};


const AnnouncementBar = () => (
  <div className="bg-[#F8D5DC] text-[#A73552] text-[10px] py-2 px-4 text-center font-medium tracking-wider uppercase border-b border-[#E8B8C3]">
    FRETE GRÁTIS PARA TODO O BRASIL
  </div>
);

const Header = ({ cartCount }: { cartCount: number }) => {
  return (
    <header className="bg-white py-3 sm:py-4 border-b border-[#F8D5DC] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <button className="text-[#7B5360] p-1">
          <Menu size={24} sm:size={28} strokeWidth={1.5} />
        </button>
        
        <BrandLogo />

        <div className="flex items-center gap-2 sm:gap-3">
          <button className="text-[#7B5360] p-1">
            <Search size={20} sm:size={24} strokeWidth={1.5} />
          </button>
          <button className="relative text-[#7B5360] p-1">
            <ShoppingBag size={20} sm:size={24} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-[#A73552] text-white text-[8px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

const DarkHero = () => (
  <section className="bg-[#24181C] text-white py-12 sm:py-16 px-4 sm:px-6 text-center space-y-6 sm:space-y-8">
    <div className="flex items-center justify-center gap-4 sm:gap-8 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-80 pb-4 border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
        Biotina + Zinco + Selênio
      </div>
      <div className="flex items-center gap-2">
        <Sun size={12} sm:size={14} />
        Suplemento em cápsulas
      </div>
    </div>

    <div className="relative w-full max-w-[min(92vw,360px)] sm:max-w-md mx-auto aspect-square rounded-2xl overflow-hidden shadow-2xl">
      <img 
        src="https://i.ibb.co/F9TwTSZ/image.png" 
        alt="Fit Hair AlwaysFit em cápsulas" 
        className="w-full h-full object-contain object-center drop-shadow-2xl"
        referrerPolicy="no-referrer"
      />
    </div>

    <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
      Beleza de dentro para fora <br />
      em uma rotina simples.
    </h2>

    <p className="text-sm leading-relaxed text-[#F8D5DC] text-center max-w-md mx-auto px-2">
      O <strong>Fit Hair AlwaysFit</strong> é um <strong>suplemento alimentar em cápsulas</strong> com nutrientes importantes para a rotina de
      cabelos, pele e unhas. A fórmula combina biotina, zinco, selênio, metilcobalamina e vitaminas para apoiar força, brilho e cuidado diário.
    </p>

    <div className="pt-2 sm:pt-4">
      <button 
        onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
        className="w-full sm:w-auto bg-[#A73552] text-white px-6 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm shadow-xl hover:bg-[#8F2C45] active:scale-95 transition-all"
      >
        Quero começar meu protocolo Fit Hair
      </button>
    </div>
  </section>
);

const LandingHero = () => (
  <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-center pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden bg-white">
    {/* Decorative elements */}
    <div className="absolute top-0 right-0 w-1/2 h-full bg-[#F8D5DC] -z-10 rounded-l-[100px] hidden lg:block"></div>
    <div className="absolute top-20 right-20 w-64 h-64 bg-[#A73552]/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
    
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="space-y-8 sm:space-y-12 text-center"
      >
        <div className="space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F8D5DC] rounded-full text-[10px] sm:text-xs font-bold text-[#A73552] uppercase tracking-widest mx-auto">
            <Sparkles size={14} /> Fit Hair AlwaysFit
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-[#24181C] leading-[1.1] tracking-tight">
            Cabelos, pele e unhas <br />
            <span className="text-[#A73552]">com cuidado diário</span> <br className="hidden sm:block" />
            em cápsulas.
          </h1>
        </div>

        {/* Image moved below title */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative max-w-xl mx-auto px-4 sm:px-0"
        >
          <div className="relative z-10 rounded-[32px] sm:rounded-[40px] overflow-hidden shadow-[0_30px_60px_-15px_rgba(167,53,82,0.32)]">
            <img 
              src="https://i.ibb.co/cSpy8QXR/image.png" 
              alt="Frasco Fit Hair AlwaysFit" 
              className="w-full h-auto object-contain max-h-[400px] sm:max-h-[500px] drop-shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </motion.div>
        
        <div className="space-y-8 sm:space-y-10">
          <p className="text-lg sm:text-xl text-[#7B5360] max-w-2xl leading-relaxed mx-auto">
            O <strong>Fit Hair</strong>, da <strong>AlwaysFit</strong>, foi pensado para quem quer apoiar a rotina de beleza de dentro para fora.
            Cada cápsula reúne biotina, zinco, selênio, metilcobalamina e vitaminas em um protocolo prático para o dia a dia.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => {
                document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-[#A73552] text-white px-8 sm:px-10 py-5 sm:py-6 rounded-full font-bold text-base sm:text-lg shadow-2xl shadow-rose-200 hover:bg-[#8F2C45] transition-all transform hover:scale-105 flex items-center justify-center gap-3 group mx-auto sm:mx-0"
            >
              QUERO MEU FIT HAIR
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-[#F8D5DC] max-w-lg mx-auto">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white overflow-hidden bg-gray-100">
                  <img src={`https://randomuser.me/api/portraits/women/${i + 10}.jpg`} alt="User" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex justify-center sm:justify-start text-[#A73552]">
                {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" stroke="none" />)}
              </div>
              <p className="text-[10px] sm:text-xs text-[#7B5360] font-medium">+15.000 mulheres na rotina Fit Hair</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Benefits = () => (
  <section id="beneficios" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] tracking-tight">
          O que o Fit Hair apoia na sua rotina?
        </h2>
        <p className="text-sm sm:text-base text-[#7B5360]">
          Uma fórmula em cápsulas com nutrientes reconhecidos no cuidado diário de cabelos, pele e unhas, com uso simples e fácil de manter.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        {[
          { icon: <Sparkles />, title: "Cabelo mais cuidado", desc: "Biotina e vitaminas entram como suporte nutricional para fios com aparência mais forte e bem tratados." },
          { icon: <Droplets />, title: "Pele e unhas no protocolo", desc: "A proposta Skin, Hair & Nails apoia a rotina completa de beleza, não só o comprimento dos fios." },
          { icon: <Zap />, title: "Minerais essenciais", desc: "Zinco e selênio complementam a fórmula para um cuidado diário consistente e fácil de seguir." },
          { icon: <CheckCircle2 />, title: "Praticidade em cápsulas", desc: "Uma cápsula ao dia: sem textura no cabelo, sem enxágue e sem mudar sua rotina de finalização." },
        ].map((benefit, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="p-6 sm:p-8 rounded-2xl border border-[#F8D5DC] hover:border-[#A73552]/20 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#F8D5DC] rounded-xl flex items-center justify-center text-[#A73552] mb-4 sm:mb-6 group-hover:bg-[#A73552] group-hover:text-white transition-colors">
              {benefit.icon}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#24181C] mb-2 sm:mb-3">{benefit.title}</h3>
            <p className="text-[#7B5360] leading-relaxed text-xs sm:text-sm">{benefit.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Technology = () => (
  <section id="tecnologia" className="py-12 sm:py-20 bg-[#24181C] text-white overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="space-y-6 sm:space-y-8 text-center lg:text-left"
      >
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Fórmula Skin, Hair & Nails <br />
            <span className="text-[#F3C7CA]">nutrição diária em cápsulas.</span>
          </h2>
          <p className="text-[#F8D5DC]/80 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Em vez de aplicar um produto tópico, o Fit Hair entra como suplemento alimentar: uma cápsula ao dia com nutrientes do rótulo
            que ajudam a sustentar uma rotina de beleza mais constante, prática e alinhada ao autocuidado.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 text-left max-w-md mx-auto lg:mx-0">
          {[
            "Biotina, zinco e selênio para o protocolo diário Skin, Hair & Nails",
            "Metilcobalamina e vitaminas para complementar a rotina nutricional",
            "Formato em cápsulas: sem aplicação no couro cabeludo e sem enxágue",
            "Frasco com 30 cápsulas de 600mg, com recomendação de 1 cápsula ao dia"
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={12} sm:size={14} className="text-white" />
              </div>
              <span className="text-sm sm:text-base font-medium text-[#F8D5DC]">{item}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative px-4 sm:px-0"
      >
        <div className="aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img 
            src="https://i.ibb.co/NdftkBvR/image.png" 
            alt="Fit Hair AlwaysFit em cápsulas" 
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      </motion.div>
    </div>
  </section>
);

const Ingredients = () => (
  <section id="ingredientes" className="py-12 sm:py-20 bg-[#F8D5DC]/30">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] tracking-tight">
          Nutrientes em destaque
        </h2>
        <p className="text-sm sm:text-base text-[#7B5360]">
          A composição foi reposicionada para o Fit Hair do rótulo: cápsulas com biotina, minerais e vitaminas para apoiar o cuidado diário.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[
          { name: "Biotina", desc: "Ingrediente queridinho das rotinas capilares, associado ao cuidado de cabelo e unhas no dia a dia." },
          { name: "Zinco", desc: "Mineral essencial que complementa protocolos de beleza, pele e manutenção nutricional." },
          { name: "Selênio", desc: "Mineral presente na fórmula para reforçar a proposta Skin, Hair & Nails." },
          { name: "Metilcobalamina", desc: "Forma ativa da vitamina B12, adicionada para compor uma rotina nutricional mais completa." },
          { name: "Vitaminas", desc: "Um mix de vitaminas para acompanhar o cuidado diário sem complicar sua agenda." },
          { name: "30 cápsulas 600mg", desc: "Frasco com recomendação de uma cápsula ao dia, antes da principal refeição." },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#F8D5DC] hover:shadow-lg transition-all">
            <h4 className="text-base sm:text-lg font-bold text-[#A73552] mb-2">{item.name}</h4>
            <p className="text-xs sm:text-sm text-[#7B5360] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Kits = ({ onAddToCart }: { onAddToCart: (kit: any) => void }) => (
  <section id="kits" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] tracking-tight">
          Escolha seu kit Fit Hair
        </h2>
        <p className="text-sm sm:text-base text-[#7B5360]">Quanto mais constante for o uso das cápsulas, mais fácil fica manter o protocolo Skin, Hair & Nails na rotina.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-12 lg:gap-8 items-center">
        {[...KIT_CATALOG].sort((a, b) => {
          const order = [1, 3, 2];
          return order.indexOf(a.id) - order.indexOf(b.id);
        }).map((kit) => {
          const list = listPriceBRLFromKit(kit.priceBRL);
          const kitBenefits: Record<number, string[]> = {
            1: [
              "Início do protocolo Skin, Hair & Nails",
              "Apoio para fios com aparência mais forte",
              "30 dias de rotina com 1 cápsula ao dia",
            ],
            2: [
              "Mais constância para cabelos e unhas",
              "Suporte nutricional por 2 meses completos",
              "Ideal para perceber melhor a evolução da rotina",
            ],
            3: [
              "Protocolo completo de 90 dias",
              "Melhor continuidade para brilho e resistência visual",
              "Mais tempo de cuidado para pele, cabelo e unhas",
            ],
          };
          const cardClass = kit.popular
            ? "border-2 border-[#A73552] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 shadow-2xl relative sm:transform sm:scale-105 bg-white z-10"
            : "border border-[#F8D5DC] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 hover:shadow-xl transition-all";
          const treatmentClass = kit.popular
            ? "text-[10px] font-bold text-[#24181C] uppercase tracking-widest"
            : "text-[10px] font-bold text-[#7B5360] uppercase tracking-widest";

          return (
            <div key={kit.id} className={cardClass}>
              {kit.popular ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#A73552] text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  Mais Vendido
                </div>
              ) : null}
              <p className={treatmentClass}>{kit.treatmentLabel}</p>
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden">
                <img
                  src={kit.image}
                  alt={`Kit ${kit.name} Fit Hair`}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#24181C]">{kit.name}</h3>
              <div className="space-y-1">
                <p className="text-[#7B5360] line-through text-xs sm:text-sm">R$ {formatBRL(list)}</p>
                <p className="text-3xl sm:text-4xl font-bold text-[#24181C]">R$ {formatBRL(kit.priceBRL)}</p>
              </div>
              <ul className="w-full space-y-3 text-left">
                {kitBenefits[kit.id]?.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-xs sm:text-sm text-[#7B5360] leading-relaxed">
                    <CheckCircle2 size={16} className="text-[#A73552] mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  onAddToCart({
                    id: kit.id,
                    name: kit.name,
                    price: kit.priceBRL,
                    image: kit.image,
                  })
                }
                className={
                  kit.popular
                    ? "w-full py-4 bg-[#A73552] text-white rounded-full font-bold hover:bg-[#8F2C45] transition-all shadow-lg shadow-rose-200 text-sm sm:text-base"
                    : "w-full py-4 bg-[#A73552] text-white rounded-full font-bold hover:bg-[#8F2C45] transition-all shadow-lg shadow-rose-100 text-sm sm:text-base"
                }
              >
                {kit.popular ? "APROVEITAR OFERTA" : "COMPRAR AGORA"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-20 bg-[#F8D5DC]/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] text-center mb-10 sm:mb-16 tracking-tight">
          Dúvidas Frequentes
        </h2>
        
        <div className="space-y-3 sm:space-y-4">
          {[
            { q: "Como devo tomar o Fit Hair?", a: "A recomendação do rótulo é ingerir 1 cápsula ao dia, antes da principal refeição. Use com regularidade e siga a orientação do seu médico ou nutricionista se você tiver uma necessidade específica." },
            { q: "Quantas cápsulas vêm no frasco?", a: "Cada frasco contém 30 cápsulas de 600mg, pensado para aproximadamente 30 dias de protocolo diário." },
            { q: "É sérum ou produto para passar no cabelo?", a: "Não. O Fit Hair é um suplemento alimentar em cápsulas para a rotina de cabelos, pele e unhas." },
            { q: "Gestantes ou lactantes podem usar?", a: "Gestantes, lactantes, crianças e pessoas com condições de saúde ou uso de medicamentos devem consultar um profissional de saúde antes de consumir qualquer suplemento." },
            { q: "Como armazenar o Fit Hair?", a: "Mantenha o frasco bem fechado, em local seco e fresco, ao abrigo da luz, calor e umidade, e fora do alcance de crianças." },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#F8D5DC] overflow-hidden">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between text-left hover:bg-[#F8D5DC]/50 transition-colors"
              >
                <span className="font-bold text-[#24181C] text-sm sm:text-base pr-4">{item.q}</span>
                <ChevronDown className={`text-[#A73552] transition-transform flex-shrink-0 ${openIndex === i ? 'rotate-180' : ''}`} size={20} />
              </button>
              <motion.div 
                initial={false}
                animate={{ height: openIndex === i ? 'auto' : 0, opacity: openIndex === i ? 1 : 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 sm:px-8 pb-6 sm:pb-8 text-xs sm:text-sm text-[#7B5360] leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="bg-white pt-12 sm:pt-20 pb-24 sm:pb-12 border-t border-[#F8D5DC]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-12 sm:mb-16">
        <div className="space-y-4 sm:space-y-6 text-center sm:text-left">
          <div className="h-8 sm:h-10 flex justify-center sm:justify-start">
            <BrandLogo />
          </div>
          <p className="text-xs sm:text-sm text-[#7B5360] leading-relaxed">
            Suplemento alimentar em cápsulas para apoiar sua rotina de cabelos, pele e unhas com a praticidade AlwaysFit.
          </p>
          <div className="flex justify-center sm:justify-start gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F8D5DC] flex items-center justify-center text-[#A73552] hover:bg-[#A73552] hover:text-white transition-all cursor-pointer">
              <Instagram size={18} sm:size={20} />
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F8D5DC] flex items-center justify-center text-[#A73552] hover:bg-[#A73552] hover:text-white transition-all cursor-pointer">
              <Facebook size={18} sm:size={20} />
            </div>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#24181C] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Navegação</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#7B5360]">
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Início</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Benefícios</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Tecnologia</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Kits</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#24181C] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Suporte</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#7B5360]">
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Rastrear Pedido</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Políticas de Envio</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Trocas e Devoluções</li>
            <li className="hover:text-[#A73552] cursor-pointer transition-colors">Termos de Uso</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#24181C] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Contato</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#7B5360]">
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <Mail size={16} className="text-[#A73552]" />
              atendimento@alwaysfit.com.br
            </li>
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <ShieldCheck size={16} className="text-[#A73552]" />
              Compra 100% Segura
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-8 sm:pt-12 border-t border-[#F8D5DC] flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
        <p className="text-[10px] sm:text-xs text-[#7B5360] text-center sm:text-left">
          © 2024 AlwaysFit. Todos os direitos reservados.
        </p>
      </div>
    </div>
  </footer>
);

// --- Main App ---

export default function App() {
  const [cartCount, setCartCount] = useState(0);
  const [view, setView] = useState<'landing' | 'checkout' | 'pix'>('landing');
  const [selectedKit, setSelectedKit] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [urlParams, setUrlParams] = useState<Record<string, string>>(() =>
    mergeUrlParamsFromLocation()
  );

  useEffect(() => {
    const sync = () => setUrlParams(mergeUrlParamsFromLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [view]);

  const handleAddToCart = (kitData: any) => {
    setSelectedKit(kitData);
    setView('checkout');
    window.scrollTo(0, 0);
  };

  const handleFinishOrder = async (data: any) => {
    const utmPayload = toFruitfyUtmPayload(urlParams);
    const response = await fetch("/api/pix/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.customer.name.trim(),
        email: data.customer.email.trim(),
        cpf: onlyDigits(data.customer.cpf),
        phone: onlyDigits(data.customer.phone),
        amount: centsFromBRL(data.total),
        quantity: data.quantity,
        orderBumpsValue: centsFromBRL(data.orderBumpsTotal ?? 0),
        utm: utmPayload,
      }),
    });

    const payload = (await parseResponseJson(response)) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.message || "Não foi possível criar cobrança PIX na Fruitfy.";
      throw new Error(message);
    }

    const pixData = extractPixFromFruitfyPayload(payload);
    setOrderData({
      ...data,
      total: pixData.amount > 0 ? pixData.amount / 100 : data.total,
      pixCode: pixData.pixCode,
      qrCodeImage: pixData.qrCodeImage,
      orderId: pixData.orderId,
      gatewayPayload: pixData.raw,
    });
    setView('pix');
    window.scrollTo(0, 0);
  };

  if (view === 'checkout' && selectedKit) {
    return <Checkout kit={selectedKit} onBack={() => setView('landing')} onFinish={handleFinishOrder} />;
  }

  if (view === 'pix' && orderData) {
    return <PixSuccess orderData={orderData} onReset={() => setView('landing')} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#A73552] selection:text-white">
      <AnnouncementBar />
      <Header cartCount={cartCount} />
      
      <main>
        <LandingHero />
        
        <section className="py-8 bg-white border-y border-[#F8D5DC]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center items-center gap-8 sm:gap-16 opacity-40 grayscale">
            {["30 CÁPSULAS", "600MG", "SKIN, HAIR & NAILS", "USO DIÁRIO"].map((logo, i) => (
              <span key={i} className="text-[10px] sm:text-xs font-black tracking-widest uppercase text-[#24181C]">{logo}</span>
            ))}
          </div>
        </section>

        <DarkHero />

        <Benefits />
        <Technology />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="order-2 lg:order-1 hidden lg:block" />
            <div className="order-1 lg:order-2 space-y-4 sm:space-y-6 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] tracking-tight">
                Por que escolher o Fit Hair?
              </h2>
              <p className="text-sm sm:text-base text-[#7B5360] leading-relaxed">
                Cuidar do cabelo não depende apenas do que você passa nos fios. Uma rotina consistente também considera nutrientes
                que fazem parte do cuidado diário com <strong>cabelos, pele e unhas</strong>.
              </p>
              <p className="text-sm sm:text-base text-[#7B5360] leading-relaxed">
                O Fit Hair reúne ingredientes do rótulo em uma cápsula prática: biotina, zinco, selênio, metilcobalamina e vitaminas.
                A proposta é simples: um passo diário para complementar seu autocuidado, sem substituir alimentação equilibrada ou orientação profissional.
              </p>
            </div>
          </div>
        </section>

        <Ingredients />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#24181C] tracking-tight">Modo de Usar</h2>
              <div className="space-y-6 sm:space-y-8 text-left">
                {[
                  { step: "01", title: "Dose diária", desc: "Ingira 1 cápsula ao dia, conforme a recomendação de uso do rótulo." },
                  { step: "02", title: "Melhor momento", desc: "Tome antes da principal refeição, com água, para facilitar a constância do protocolo." },
                  { step: "03", title: "Consistência", desc: "Use diariamente. O frasco com 30 cápsulas acompanha aproximadamente um mês de rotina." },
                  { step: "04", title: "Orientação", desc: "Suplementos não substituem alimentação equilibrada. Consulte um profissional se tiver dúvidas ou restrições." },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 sm:gap-6">
                    <span className="text-3xl sm:text-4xl font-black text-[#E9B2BD] tabular-nums">{item.step}</span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-[#24181C] text-sm sm:text-base">{item.title}</h4>
                      <p className="text-xs sm:text-sm text-[#7B5360] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative px-4 sm:px-0">
              <img 
                src="https://i.ibb.co/qF7gMHKS/image.png" 
                alt="Como usar Fit Hair" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl w-full max-h-[560px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </section>

        <Kits onAddToCart={handleAddToCart} />

        <section className="py-20 bg-[#F8D5DC]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-8">
            <div className="w-20 h-20 bg-[#A73552] text-white rounded-full flex items-center justify-center mx-auto mb-8">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#24181C]">Garantia blindada de 30 dias</h2>
            <p className="text-[#7B5360] max-w-2xl mx-auto leading-relaxed">
              Confiamos no protocolo Fit Hair o suficiente para assumir o risco por você.
              Se dentro de 30 dias você decidir que o produto não combina com sua rotina, fale com o suporte para receber atendimento.
            </p>
          </div>
        </section>

        <section className="py-20 bg-[#24181C] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Depoimentos de quem colocou o Fit Hair na rotina</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { name: "Mariana S.", text: "Gostei porque é simples: deixo o frasco na cozinha e tomo antes do almoço. Virou um cuidado diário sem esforço.", location: "São Paulo, SP" },
                { name: "Carla M.", text: "Eu queria algo para cabelo, pele e unhas sem passar produto no couro cabeludo. As cápsulas encaixaram muito melhor na minha rotina.", location: "Rio de Janeiro, RJ" },
                { name: "Patrícia L.", text: "O visual do produto é lindo e a proposta é direta: 1 cápsula por dia. Comprei o kit para manter a constância.", location: "Curitiba, PR" },
              ].map((review, i) => (
                <div key={i} className="bg-white/5 p-8 rounded-2xl border border-white/10 text-left space-y-4">
                  <div className="flex text-[#A73552]">
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" stroke="none" />)}
                  </div>
                  <p className="text-[#F8D5DC] italic leading-relaxed">"{review.text}"</p>
                  <div>
                    <p className="font-bold text-white">{review.name}</p>
                    <p className="text-xs text-[#F3C7CA]">{review.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}

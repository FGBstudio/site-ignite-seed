/**
 * La larghezza utile di ogni pagina.
 *
 * Era fissa a 1680px: su uno schermo da 1900 restavano duecento pixel di
 * margine vuoto mentre le tabelle a quindici colonne finivano tagliate. Ora la
 * pagina prende lo schermo che ha, con un tetto alto che serve solo a non far
 * diventare illeggibili le righe di testo su un monitor molto largo, e con un
 * margine laterale che si stringe sugli schermi piccoli.
 *
 * Sta in un modulo suo perche' la barra in alto, l'intestazione e il contenuto
 * devono allinearsi: tre valori separati divergono al primo cambio.
 */
export const SHELL = "w-full max-w-[2200px] mx-auto px-4 sm:px-6 xl:px-8";

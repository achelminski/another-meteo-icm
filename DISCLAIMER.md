# Zastrzeżenia prawne / Disclaimer

[Polski](#polski) · [English](#english)

## Polski

**Projekt nieoficjalny.** Meteo ICM to niezależny, hobbystyczny projekt. Nie jest powiązany
z Interdyscyplinarnym Centrum Modelowania Matematycznego i Komputerowego Uniwersytetu
Warszawskiego (ICM UW) ani serwisem meteo.pl, nie jest przez nie wspierany ani autoryzowany.

**Dane prognostyczne.** Prognozy pobierane przez integrację są własnością ICM UW / meteo.pl
i podlegają ich prawom autorskim oraz warunkom korzystania. Projekt nie udziela żadnych praw
do tych danych — integracja jedynie pobiera prognozę dla lokalizacji skonfigurowanej przez
użytkownika w jego własnej instalacji Home Assistant. Prezentując dane, podawaj źródło:
„© ICM UW, meteo.pl”.

**Nieoficjalne API.** Integracja korzysta z nieudokumentowanego API, z którego korzysta strona
meteo.pl. Może ono zmienić się lub przestać działać w dowolnym momencie bez uprzedzenia.
Integracja ogranicza liczbę zapytań: co 30 minut sprawdza dostępność nowego przebiegu modelu,
a pełne dane pobiera tylko wtedy, gdy przebieg jest nowy. Nie zwiększaj częstotliwości odpytywania
i korzystaj z integracji wyłącznie do celów prywatnych, niekomercyjnych.

**Wygląd karty.** Karta meteogramu odtwarza układ wykresów znany z meteo.pl, ale jej kod jest
niezależną implementacją — nie zawiera kodu, grafik ani logotypów meteo.pl.

**Znaki towarowe.** Nazwy ICM, ICM UW, meteo.pl, UM i GFS są używane wyłącznie opisowo,
w celu wskazania źródła danych. Projekt nie używa oficjalnych logotypów.

**Brak gwarancji.** Oprogramowanie jest dostarczane „TAKIM, JAKIE JEST”, bez jakichkolwiek gwarancji.
Autor nie odpowiada za poprawność, kompletność ani dostępność prognoz, ani za skutki decyzji
podjętych na ich podstawie. Nie używaj projektu do decyzji, od których zależy bezpieczeństwo
ludzi lub mienia — w takich sytuacjach korzystaj z oficjalnych komunikatów i ostrzeżeń.

**Usunięcie na żądanie.** Jeśli jesteś przedstawicielem właściciela praw i masz zastrzeżenia
co do projektu, zgłoś je w repozytorium (Issues) — projekt zostanie zmieniony lub usunięty.

**Zgoda na wykorzystanie danych.** W sprawie oficjalnej zgody na wykorzystanie prognoz ICM
(np. komercyjnego) kontaktuj się bezpośrednio z ICM UW — dane kontaktowe są na stronach
[meteo.pl](https://www.meteo.pl) i [icm.edu.pl](https://icm.edu.pl).

## English

**Unofficial project.** Meteo ICM is an independent hobby project. It is not affiliated with,
endorsed or authorised by the Interdisciplinary Centre for Mathematical and Computational
Modelling of the University of Warsaw (ICM UW) or meteo.pl.

**Forecast data.** The forecasts retrieved by the integration are the property of ICM UW / meteo.pl
and remain subject to their copyright and terms of use. This project grants no rights to that data —
the integration only retrieves the forecast for the location configured by the user in their own
Home Assistant installation. When presenting the data, credit the source: "© ICM UW, meteo.pl".

**Unofficial API.** The integration uses the undocumented API behind the meteo.pl website.
It may change or stop working at any time without notice. The integration keeps requests low:
every 30 minutes it checks whether a new model run is available and downloads the full data only
when the run is new. Do not increase the polling rate, and use the integration for personal,
non-commercial purposes only.

**Card appearance.** The meteogram card reproduces the chart layout known from meteo.pl, but its
code is an independent implementation — it contains no code, graphics or logos from meteo.pl.

**Trademarks.** The names ICM, ICM UW, meteo.pl, UM and GFS are used descriptively only, to
identify the data source. The project does not use any official logos.

**No warranty.** The software is provided "AS IS", without warranty of any kind. The author is not
liable for the accuracy, completeness or availability of the forecasts, or for the consequences of
decisions based on them. Do not use the project for decisions affecting the safety of people or
property — rely on official forecasts and warnings instead.

**Takedown.** If you represent the rights holder and object to this project, please open an issue
in the repository — the project will be changed or removed.

**Permission to use the data.** For official permission to use ICM forecasts (e.g. commercially),
contact ICM UW directly — contact details are on [meteo.pl](https://www.meteo.pl) and
[icm.edu.pl](https://icm.edu.pl).

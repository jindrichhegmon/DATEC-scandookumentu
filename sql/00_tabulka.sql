-- Tabulka logu AI rozborů. V CLB1 už existuje; tenhle skript je tu jen pro dokumentaci
-- a pro případ, že by se aplikace zakládala znovu. Server ho sám nespouští.
-- Převzato ze scénáře Make „ScanDokumentu_LogSQL" (ID 9727444), který DDL pouštěl před každým zápisem.
IF OBJECT_ID('dbo.CLB_SCANN_DOKUMENTU','U') IS NULL
BEGIN
  CREATE TABLE dbo.CLB_SCANN_DOKUMENTU (
    Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CLB_SCANN_DOKUMENTU PRIMARY KEY,
    Datum DATETIME2(0) NOT NULL CONSTRAINT DF_CLB_SCANN_DOKUMENTU_Datum DEFAULT SYSDATETIME(),
    Soubory NVARCHAR(1000) NULL,
    Prompt NVARCHAR(MAX) NULL,
    Odpoved NVARCHAR(MAX) NULL,
    Rezim NVARCHAR(20) NULL,
    Model NVARCHAR(100) NULL
  )
END;

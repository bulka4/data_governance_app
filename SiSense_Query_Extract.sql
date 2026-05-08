

--Get SQL Scripts
-- Below tables from the sisense_stage and sisense_prod schemas contains Sisense metadata prepared using scripts using Sisense Rest API
IF OBJECT_ID('tempdb..#query','u') IS NOT NULL DROP TABLE #Query
SELECT Distinct D.title AS Dashboard
      ,REPLACE(COALESCE(T.[custom_table_expression],CASE WHEN T.[importQuery]='' THEN NULL ELSE T.[importQuery] END,T.[name]),'"','') AS sql_field
INTO #Query
FROM [Stage].[Sisense_Prod].[DM_DataModelTables] T
INNER JOIN [Stage].[Sisense_Prod].[DM_DataModels] M
	On T.[DataModel_oid] = M.[DataModel_oid]
INNER JOIN [Stage].[Sisense_Prod].Elasticubes E
	ON E.oid = M.DataModel_oid
INNER JOIN [Stage].[Sisense_Prod].Dashboards D
	ON E.title = D.SourceElasticube
	
--Split out the sql queries at JOIN and FROM 
IF OBJECT_ID('tempdb..#SQL_Output','u') IS NOT NULL DROP TABLE #SQL_Output;
WITH CTE AS (
    SELECT Dashboard,sql_field
    FROM #Query
)
SELECT DISTINCT Dashboard,sql_field,trim(value) AS table_name
INTO #SQL_Output
FROM CTE
CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(sql_field, 'JOIN', ','), 'FROM', ','), ',')
WHERE value != '';

--Cleanup data and trim after the next gap in text, so we can isolate tables/views
UPDATE #SQL_Output SET table_name = trim(table_name)
UPDATE #SQL_Output SET table_name = LEFT(table_name,CHARINDEX(CHAR(10),table_name)) WHERE CHARINDEX(CHAR(10),table_name)>0
UPDATE #SQL_Output SET table_name = LEFT(table_name,CHARINDEX(CHAR(13),table_name)) WHERE CHARINDEX(CHAR(13),table_name)>0
UPDATE #SQL_Output SET table_name = REPLACE(table_name,CHAR(13),' ')
UPDATE #SQL_Output SET table_name = REPLACE(table_name,CHAR(10),' ')
UPDATE #SQL_Output SET table_name = REPLACE(table_name,CHAR(9),' ')
UPDATE #SQL_Output SET table_name = LEFT(table_name,CHARINDEX(' ',table_name)) WHERE CHARINDEX(' ',table_name)>0
UPDATE #SQL_Output SET table_name = LEFT(table_name,CHARINDEX('	',table_name)) WHERE CHARINDEX('	',table_name)>0
UPDATE #SQL_Output SET table_name = REPLACE(table_name,'[','')
UPDATE #SQL_Output SET table_name = REPLACE(table_name,']','')
DELETE FROM #SQL_Output WHERE table_name IS NULL
DELETE FROM #SQL_Output WHERE table_name LIKE '%SELECT%'
DELETE FROM #SQL_Output WHERE table_name LIKE '%(%'
DELETE FROM #SQL_Output WHERE table_name = CHAR(10)
DELETE FROM #SQL_Output WHERE table_name = CHAR(13)
DELETE FROM #SQL_Output WHERE table_name = ']'+CHAR(10)
DELETE FROM #SQL_Output WHERE LEN(table_name)<2

--Get view/table derivation
IF OBJECT_ID('tempdb..#View_Detail','u') IS NOT NULL DROP TABLE #View_Detail
SELECT DISTINCT schema_name(v.schema_id) as schema_name,
		v.name as view_name,
		'Stage' AS Catalog_name,
		'View' AS Object_Type,
		schema_name(o.schema_id) as referenced_schema_name,
		o.name as referenced_entity_name,
		o.type_desc as entity_type
INTO #View_Detail
FROM stage.sys.views v
INNER JOIN stage.sys.sql_expression_dependencies d ON d.referencing_id = v.object_id AND d.referenced_id is not null
INNER JOIN stage.sys.objects o ON o.object_id = d.referenced_id
UNION ALL
SELECT DISTINCT schema_name(v.schema_id) as schema_name,
		v.name as view_name,
		'DW' AS Catalog_name,
		'View' AS Object_Type,
		schema_name(o.schema_id) as referenced_schema_name,
		o.name as referenced_entity_name,
		o.type_desc as entity_type
FROM dw.sys.views v
INNER JOIN dw.sys.sql_expression_dependencies d ON d.referencing_id = v.object_id AND d.referenced_id is not null
INNER JOIN dw.sys.objects o ON o.object_id = d.referenced_id
UNION ALL
SELECT DISTINCT
    SCHEMA_NAME(p.schema_id) AS schema_name,
    p.name AS procedure_name,
    'Stage' AS catalog_name,
	'Stored Procedure' AS Object_Type,
    SCHEMA_NAME(o.schema_id) AS referenced_schema_name,
    o.name AS referenced_entity_name,
    o.type_desc AS entity_type
FROM Stage.sys.procedures p
INNER JOIN Stage.sys.sql_expression_dependencies d ON d.referencing_id = p.object_id AND d.referenced_id IS NOT NULL
INNER JOIN Stage.sys.objects o ON o.object_id = d.referenced_id
WHERE p.type = 'P'
UNION ALL
SELECT DISTINCT
    SCHEMA_NAME(p.schema_id) AS schema_name,
    p.name AS procedure_name,
    'DW' AS catalog_name,
	'Stored Procedure' AS Object_Type,
    SCHEMA_NAME(o.schema_id) AS referenced_schema_name,
    o.name AS referenced_entity_name,
    o.type_desc AS entity_type
FROM dw.sys.procedures p
INNER JOIN dw.sys.sql_expression_dependencies d ON d.referencing_id = p.object_id AND d.referenced_id IS NOT NULL
INNER JOIN dw.sys.objects o ON o.object_id = d.referenced_id
WHERE p.type = 'P'


--Final Results
IF OBJECT_ID('tempdb..#Results','u') IS NOT NULL DROP TABLE #Results
SELECT S.Dashboard
		,COALESCE(V6.Catalog_name,V5.Catalog_name,V4.Catalog_name,V3.Catalog_name,V2.Catalog_name,V.Catalog_name,I.TABLE_CATALOG) AS [Catalog]
		,COALESCE(V6.referenced_schema_name,V5.referenced_schema_name,V4.referenced_schema_name,V3.referenced_schema_name,V2.referenced_schema_name,V.referenced_schema_name,I.TABLE_SCHEMA) AS [Schema]
		,COALESCE(V6.referenced_entity_name,V5.referenced_entity_name,V4.referenced_entity_name,V3.referenced_entity_name,V2.referenced_entity_name,V.referenced_entity_name,I.TABLE_NAME) AS [Table]
INTO #Results
FROM #SQL_Output S
INNER JOIN (SELECT TABLE_CATALOG,TABLE_SCHEMA,TABLE_NAME FROM Stage.INFORMATION_SCHEMA.TABLES UNION ALL SELECT TABLE_CATALOG,TABLE_SCHEMA,TABLE_NAME FROM DW.INFORMATION_SCHEMA.TABLES) I
	ON (UPPER(S.table_name) = UPPER(I.TABLE_CATALOG) +'.'+ UPPER(I.TABLE_SCHEMA) +'.'+ UPPER(I.TABLE_NAME))
	OR (UPPER(S.table_name) = UPPER(I.TABLE_SCHEMA) +'.'+ UPPER(I.TABLE_NAME))
	OR (UPPER(S.table_name) = UPPER(I.TABLE_NAME))
LEFT JOIN #View_Detail V
	ON I.TABLE_SCHEMA = V.schema_name
	AND I.TABLE_NAME = V.view_name
	AND I.TABLE_CATALOG = V.Catalog_Name
LEFT JOIN #View_Detail V2
	ON V2.schema_name = V.referenced_schema_name
	AND V2.view_name = V.referenced_entity_name
	AND V2.Catalog_Name = V.Catalog_Name
LEFT JOIN #View_Detail V3
	ON V3.schema_name = V2.referenced_schema_name
	AND V3.view_name = V2.referenced_entity_name
	AND V3.Catalog_Name = V2.Catalog_Name
LEFT JOIN #View_Detail V4
	ON V4.schema_name = V3.referenced_schema_name
	AND V4.view_name = V3.referenced_entity_name
	AND V4.Catalog_Name = V3.Catalog_Name
LEFT JOIN #View_Detail V5
	ON V5.schema_name = V4.referenced_schema_name
	AND V5.view_name = V4.referenced_entity_name
	AND V5.Catalog_Name = V4.Catalog_Name
LEFT JOIN #View_Detail V6
	ON V6.schema_name = V5.referenced_schema_name
	AND V6.view_name = V5.referenced_entity_name
	AND V6.Catalog_Name = V5.Catalog_Name


SELECT distinct *
FROM #Results


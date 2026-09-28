# วิธีคำนวณและระดับหลักฐาน: เป้าหมายธุรกิจ 1 ปี

เปิดเมื่อผู้ใช้ให้ตัวเลขฐาน, ขอ scenario, ข้อมูลตลาดหรือขอให้ย้อนเป้า อย่าโหลดตัวเลขตัวอย่างเป็นค่ามาตรฐานของตลาด

## 1. Evidence ledger และคำถามต่อยอด

| Field | ค่า/หน่วย | ช่วงเวลา/นิยาม | ระดับ | แหล่ง/วันที่ | ผู้ยืนยัน/ยังขาด |
|---|---|---|---|---|---|
| รายได้ขายสุทธิ | ... | ก่อน/หลัง VAT, คืนสินค้า, ส่วนลด | Actual / Benchmark / Assumption / Derived / รอยืนยัน | ... | ... |

- **Actual:** บริษัทให้มา; ระบุว่าเอกสารจริงหรือผู้ประกอบการเล่า และงวดใด. **Benchmark:** แหล่งตลาดที่ตรวจได้พร้อมวันที่ ภูมิศาสตร์ หมวดสินค้า ช่องทาง และตัวหาร. **Assumption:** ค่าเลือกลองคำนวณจากเหตุผลและผู้ยืนยัน; ทำช่วงสูง/ต่ำ. **Derived:** สูตร, อินพุตและหน่วย. **รอยืนยัน:** ห้ามเติมตัวเลขเทียม.
- ถ้าข้อมูลขัดกัน (ยอดชิ้น × ราคาขายไม่ตรงรายได้, ลูกค้ารายปีน้อยกว่าลูกค้ารายเดือนโดยไม่มีคำอธิบาย, rate >100% ฯลฯ) หยุดที่คำถามเดียวเพื่อยืนยัน ไม่บังคับกรอกทุกช่องพร้อมกัน.
- วิธีการตรวจตลาด: SBA อธิบายบทบาทของ market research, competitive analysis, business plan, ต้นทุน และ break-even ที่ https://www.sba.gov/counseling/plan-your-business/ (แนววิธี **ไม่ใช่** benchmark conversion/repeat หรือราคาไทย). สำหรับกิจการไทยหาแหล่งทางการของไทยและข้อมูลหมวดสินค้า/คู่แข่งที่ตรวจได้ก่อน; จดวันที่อ่านและนิยาม sample; ถ้าไม่พบไม่มี rate อ้างอิง.

## 2. ฐานปัจจุบันและเป้า

- รายได้เดือน (ตามสินค้าจริง): `R_m = sum_i(ขายสุทธิ_i × ราคาขายสุทธิต่อหน่วย_i)`. ถ้าผู้ใช้มีเพียงรายได้/วัน ให้คูณ **วันขายจริง** ต่อเดือน; รายได้/สัปดาห์ให้ใช้จำนวนสัปดาห์จริงของงวด ไม่สมมติ 30 วันขาย. `R_y = sum(รายได้จริง 12 เดือน)`; ถ้ามีแค่เดือนตัวแทน `R_y ≈ R_m × 12` ระบุว่าเป็นการประมาณแบบไม่คิดฤดูกาล ไม่ใช่ Actual รายปี.
- ราคาเฉลี่ย: `ASP = รายได้จากสินค้าตามงวด / จำนวนหน่วยที่ขายจริงในงวด` เฉพาะหน่วยเทียบกันได้. ถ้าขายชั่วโมงบริการกับสินค้าคนละหน่วย แยกกลุ่ม ไม่ใช้ ASP ตัวเดียว.
- `Growth% = (Target_y - Baseline_y) / Baseline_y × 100` เฉพาะ Baseline > 0; ถ้าฐานเป็น 0 แสดงเพิ่มขึ้นกี่บาทแต่ Growth% ไม่กำหนด. เป้าต่ำ/เท่าฐานอาจเป็นการรักษาสถานะ ถามเจ้าของว่าตั้งใจหรือไม่ ไม่บังคับให้โต.
- ไม่รู้เป้า: ขอฐานที่เจ้าของตรวจ แล้วเสนอ **Conservative / Target / Stretch** ด้วยตัวเลข derived จากสมมติฐานที่เปิดเผย เช่น เพิ่มจำนวนลูกค้า, ช่องทาง หรือกำลังผลิต; แสดงทุกคอขวด/งบที่ต้องเปลี่ยน ห้ามยืมเปอร์เซ็นต์ growth จากตัวอย่าง.

## 3. Revenue → สินค้า/Package → ลูกค้า

- เมื่อทราบ mix รายได้: `Target_i = Target_y × revenue_share_i`, ผลรวม share = 100%; `Units_i = ceil(Target_i / Net_price_i)` สำหรับจำนวนเต็ม; ยอดจริงหลังปัด `sum(Units_i × Net_price_i)` อาจสูงกว่า target. อย่าหารด้วยราคาขายเฉลี่ยหากมี mix แยก; ถ้า mix ไม่รู้ใช้ mix ปัจจุบันเป็น **Assumption** ที่เจ้าของต้องยืนยัน.
- สำหรับ subscription ใช้ลูกค้าที่ active/เดือน × ค่า fee × เดือน active (ตรวจ churn และ start month); งานบริการใช้ชั่วโมง/โครงการที่ส่งมอบจริง ไม่สร้างหน่วยสินค้าเทียม.
- `Revenue_y = sum(ยอดขายสุทธิทุก order)` หรือ `ลูกค้าที่ซื้อ × จำนวน order/ลูกค้า × มูลค่าขายสุทธิต่อ order` เมื่อแต่ละปัจจัยนิยามตาม cohort เดียวกัน. **ลูกค้าไม่เท่ากับคำสั่งซื้อ.** แยก order แรกของลูกค้าใหม่จาก order ซื้อซ้ำของลูกค้าเก่าและใหม่; upsell/cross-sell เพิ่มมูลค่าใน order ที่มีอยู่หรือเป็น order แยก แต่ **อย่าบวกซ้ำ**. ถามสัดส่วนลูกค้ากลับมาซื้อ (`repeat rate`: ลูกค้าที่ซื้อซ้ำ / cohort ลูกค้าตั้งต้น) และความถี่ (`purchase frequency`: จำนวน order ต่อ active customer ต่อปี) แยกกันตามสินค้า.
- เมื่อทราบรายได้ซื้อซ้ำที่มีหลักฐาน แยกลูกค้าเดิมกับ cohort ใหม่ตามแม่แบบ: `revenue_per_new_customer = first_order_AOV + expected_repeat_orders_per_new_customer × new_cohort_repeat_AOV`; `new_customers = ceil(max(0, Target_y − repeat_existing_revenue) / revenue_per_new_customer)`. รายได้ซื้อซ้ำของ cohort ใหม่ขึ้นกับจำนวนลูกค้าใหม่ จึงรวมไว้ในตัวหาร ไม่หักจากเป้าก่อน (ไม่นับซ้ำหรือวนกลับ). หาก repeat_existing_revenue ถึงเป้าแล้วลูกค้าใหม่เป็น 0 ไม่ติดลบ และให้ตรวจ mix/cohort. เมื่อไม่มี repeat/AOV ระบุ `รอยืนยัน` และขอช่วงสถานการณ์ ไม่เดาตัวเลข.

## 4. ย้อน Sales Funnel ทีละขั้น

- กำหนด Prospect = ผู้มีโอกาสตรงกลุ่มที่เข้าถึงได้; Lead = ผู้คุย/สอบถามจริง; Say Yes = ผู้ซื้อที่เกิดขึ้นจาก Lead. `say_yes_rate = new_buyers / qualified_leads`; `lead_rate = qualified_leads / reached_prospects` **ต้องบอกงวด ช่องทางและตัวหาร**. ไม่ใช้ rate เดียวกับทุกธุรกิจ.
- `leads_required = ceil(new_customers_required / say_yes_rate)`; `prospects_required = ceil(leads_required / lead_rate)` เฉพาะ rate > 0 ที่มีแหล่งหรือเจ้าของตกลงสมมติฐาน. ถ้ามีเพียง Say Yes rate ให้ผลถึง leads เท่านั้น อย่าแสร้งว่ารู้จำนวน prospects. ตรวจ capacity ของแต่ละช่องทาง/พนักงานและ lead time ก่อนทำกิจกรรม.
- 0% แปลย้อนจำนวนแน่นอนไม่ได้ ต้องปรับ funnel; >100% เป็นข้อมูลผิดหรือหน่วยไม่ตรง. ค่าเฉลี่ยต้องถ่วงตาม channel/mix เมื่อมีข้อมูล.

## 5. Capacity → ผลิต → วัตถุดิบ → คน

- `net_good_units_required = units_sold + desired_ending_inventory - usable_opening_inventory + replacements/returns ที่ต้องส่งทดแทน` (ถ้าไม่มี returns ที่ต้องส่งซ้ำ = 0); desired ending inventory **รวม Safety Stock แล้ว** ไม่บวกอีกครั้ง. `gross_production_units = ceil(max(0, net_good_units_required) / yield)` เมื่อ yield ∈ (0,1]; อย่าบวก expected loss ซ้ำกับการหาร yield. ถ้าสต็อกเปิดพอให้ตั้งเป้าผลิต 0 แล้วตรวจคลัง/อายุสินค้า.
- `capacity_gap = max(0, gross_required - available_gross_capacity)` ทั้งในหน่วยและงวดเดียวกัน; คำนึงถึง downtime, changeover, lead time และ capacity รายสินค้า. สำหรับบริการใช้ชั่วโมงทีม/ทรัพยากรและการเข้าถึงคิว ไม่ใช้สูตรเสียชิ้นงาน.
- `material_j_gross_required = gross_production_units × BOM_j_per_attempt + desired_raw_end_j`; `material_j_purchase = max(0, material_j_gross_required - usable_raw_open_j)` และ `material_j_excess_stock = max(0, usable_raw_open_j - material_j_gross_required)` รายงานส่วนเกินต่างหาก ไม่ออกใบสั่งซื้อจำนวนติดลบ. แยก MOQ, lead time, supplier capacity, ของเสียของวัตถุดิบ และ supplier สำรอง; ไม่บวก Safety Stock ซ้ำถ้าอยู่ใน desired end. สั่งซื้อจริงต้องให้มนุษย์อนุมัติ.
- `production_people_needed = ceil(required_crew_hours / effective_productive_hours_per_person)`; `sales_people_needed = ceil(required_new_buyers_per_month / verified_new_buyers_per_salesperson_month)` เมื่อ productivity > 0 และช่องทางขายนั้นเป็นงานคนจริง; หักกำลังคนปัจจุบันที่พร้อมทำงานเพื่อหา gap, แยกเจ้าของ/พาร์ทไทม์/overlap. ถ้า rate ไม่ทราบ ห้ามสรุปต้องจ้างกี่คน.

## 6. Finance, month-by-month และ verdict

- ต้นทุน/มาร์จิน: `gross_profit = net_revenue - cost_of_goods_sold`; `gross_margin = gross_profit / net_revenue` ถ้ารายได้ > 0. Break-even units = `ceil(fixed_cost / (net_price - variable_cost_per_unit))` เมื่อ contribution เป็นบวกและข้อมูลครบ; ไม่เอา Revenue เป็น Cash Flow.
- เงินทุนหมุนเวียน: ทำตาราง **เงินสดรับ** ตามเก็บเงิน/เครดิตเทอม กับ **เงินสดจ่าย** ตามซื้อวัตถุดิบ ผลิต พนักงาน การตลาด ภาษี ค่าส่ง หนี้และค่าใช้จ่ายที่เกี่ยวข้อง; `peak_shortfall = max(0, -min(cumulative_net_cash_flow_after_opening_cash))`; ตรวจวันที่จ่ายก่อนวันรับจริง. หากไม่มี credit terms/ค่าใช้จ่าย/เงินสดในมือ แสดง `รอยืนยัน` ไม่ประเมินวงเงินกู้.
- เดือน 1..12: ใช้ประวัติ/Seasonality/แคมเปญ/วันหยุด/รอบซื้อ/Lead Time ที่เจ้าของยืนยันเป็นน้ำหนัก `w_m` รวม = 1; `R_m = Target_y × w_m`; ประมาณหน่วยแต่ละสินค้าแล้วปัดขึ้น ตรวจ `sum(R_m)` และ `sum(units_m)` กับยอดปีหลังปัด; ยอดขายทุกเดือนต้องผ่าน capacity, cash และ supplier รายเดือน. ถ้าไม่มีฤดูกาล **อย่าออกแผน 12 เดือนแบบสมมติว่าหารเท่ากันแล้วเป็น final**; ถ้าต้องเทียบเท่านั้นให้ติด Assumption ชั่วคราวและขอเจ้าของยืนยันก่อนฟันธง.
- ตรวจ feasibility เฉพาะเมื่อฐาน/เป้า, unit economics, repeat/funnel, capacity/supplier, people/cash ครบ: `FEASIBLE` = พร้อมด้วยทรัพยากรปัจจุบัน, `STRETCH` = เพิ่มปัจจัยเล็กน้อยที่ระบุได้, `AGGRESSIVE` = ต้องเปลี่ยนช่องทาง/ทีม/กำลังผลิตอย่างมีนัย, `NOT YET FEASIBLE` = พบคอขวดชัดและยังแก้ไม่ได้. ถ้าข้อมูลสำคัญขาด ระบุ `รอยืนยัน` ไม่จัดระดับสี.
- `gap_m = Actual_m - Target_m`; `remaining_required = max(0, annual_target - actual_closed)` โดย `actual_closed = sum(Actual_closed_months)`; `excess_over_target = max(0, actual_closed - annual_target)`. เมื่อยอดปีเกินแล้ว ห้ามแจกยอดติดลบในเดือนที่เหลือ ให้แสดงส่วนเกินและถามเจ้าของว่าจะรักษาระดับ/ตั้งเป้าใหม่. หากยังไม่ถึงเป้า ให้แจกส่วนที่เหลือตาม seasonality กับข้อจำกัดใหม่ ไม่ย้อนแก้ Actual เดือนปิดแล้ว.

## ภาพรวมกติกา

รายได้ทุกบรรทัดต้องตามกลับไปหา `จำนวน × ราคาขายสุทธิ` หรือ `ลูกค้า × order/ลูกค้า × AOV` ที่นิยามไม่ทับกัน; ทุกจำนวนที่คนต้องทำต้องผูกกิจกรรม/ช่องทางและ capacity. ตรวจด้วยเครื่องคำนวณหรือ spreadsheet ไม่ใช้การเดา. แยก feasibility ทางคณิตศาสตร์จากความเป็นไปได้จริงและความพร้อมเงินสด. ไม่ให้คำแนะนำลงทุน/กู้เงินแทนผู้เชี่ยวชาญ.
